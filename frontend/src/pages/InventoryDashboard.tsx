import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import api from '../services/api';
import { LoadingSpinner } from '../components/shared/LoadingSpinner';

interface Nozzle {
  id: string;
  name: string;
  tankId: string;
  tank: { fuelType: string };
}

interface Tank {
  id: string;
  fuelType: string;
  capacity: number;
  currentLevel: number;
}

interface ShiftReading {
  id: string;
  nozzleId: string;
  openingReading: number;
  closingReading: number | null;
  consumption: number | null;
  nozzle: Nozzle;
}

interface Shift {
  id: string;
  shiftType: string;
  status: string;
  locked: boolean;
  shiftReadings: ShiftReading[];
}

export const InventoryDashboard = () => {
  const { user, isSM } = useAuth();
  const [stationId, setStationId] = useState<string>('');
  const [nozzles, setNozzles] = useState<Nozzle[]>([]);
  const [tanks, setTanks] = useState<Tank[]>([]);
  const [currentShift, setCurrentShift] = useState<Shift | null>(null);
  const [readings, setReadings] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [showDeliveryForm, setShowDeliveryForm] = useState(false);
  const [deliveryData, setDeliveryData] = useState({ tankId: '', liters: '' });

  useEffect(() => {
    if (user?.stationId) {
      setStationId(user.stationId);
      loadData(user.stationId);
    }
  }, [user]);

  const loadData = async (sid: string) => {
    try {
      const [nozzlesRes, tanksRes, shiftRes] = await Promise.all([
        api.get(`/api/inventory/stations/${sid}/nozzles`),
        api.get(`/api/inventory/stations/${sid}/tanks`),
        api.get(`/api/inventory/shifts/stations/${sid}/current`),
      ]);

      setNozzles(nozzlesRes.data.nozzles);
      setTanks(tanksRes.data.tanks);
      setCurrentShift(shiftRes.data.shift);

      // Initialize readings from existing shift readings
      const readingsMap: Record<string, number> = {};
      shiftRes.data.shift.shiftReadings.forEach((sr: ShiftReading) => {
        if (sr.closingReading !== null) {
          readingsMap[sr.nozzleId] = sr.closingReading;
        }
      });
      setReadings(readingsMap);
    } catch (error) {
      console.error('Failed to load data', error);
    } finally {
      setLoading(false);
    }
  };

  const handleReadingChange = (nozzleId: string, value: string) => {
    setReadings({ ...readings, [nozzleId]: parseFloat(value) || 0 });
  };

  const handleSubmitReadings = async () => {
    try {
      const readingsArray = Object.entries(readings).map(([nozzleId, closingReading]) => ({
        nozzleId,
        closingReading,
      }));

      await api.post(`/api/inventory/shifts/${currentShift?.id}/readings`, {
        readings: readingsArray,
      });

      // Lock the shift
      await api.post(`/api/inventory/shifts/${currentShift?.id}/lock`);

      alert('Readings submitted and shift locked');
      loadData(stationId);
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to submit readings');
    }
  };

  const handleDelivery = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post(`/api/inventory/tanks/${deliveryData.tankId}/deliveries`, {
        liters: parseFloat(deliveryData.liters),
      });
      setShowDeliveryForm(false);
      setDeliveryData({ tankId: '', liters: '' });
      loadData(stationId);
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to record delivery');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Inventory Dashboard</h1>
        <button
          onClick={() => setShowDeliveryForm(!showDeliveryForm)}
          className="bg-primary-600 text-white px-4 py-2 rounded-md hover:bg-primary-700"
        >
          {showDeliveryForm ? 'Cancel' : 'Record Delivery'}
        </button>
      </div>

      {showDeliveryForm && (
        <div className="bg-white shadow rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Record Tanker Delivery</h2>
          <form onSubmit={handleDelivery} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Tank</label>
              <select
                required
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
                value={deliveryData.tankId}
                onChange={(e) => setDeliveryData({ ...deliveryData, tankId: e.target.value })}
              >
                <option value="">Select a tank</option>
                {tanks.map((tank) => (
                  <option key={tank.id} value={tank.id}>
                    {tank.fuelType} (Current: {tank.currentLevel.toFixed(2)}L / {tank.capacity.toFixed(2)}L)
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Liters</label>
              <input
                type="number"
                step="0.01"
                required
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
                value={deliveryData.liters}
                onChange={(e) => setDeliveryData({ ...deliveryData, liters: e.target.value })}
              />
            </div>
            <button
              type="submit"
              className="bg-primary-600 text-white px-4 py-2 rounded-md hover:bg-primary-700"
            >
              Record Delivery
            </button>
          </form>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        {tanks.map((tank) => (
          <div key={tank.id} className="bg-white shadow rounded-lg p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">{tank.fuelType}</h3>
            <div className="mb-2">
              <div className="flex justify-between text-sm text-gray-600 mb-1">
                <span>Current Level</span>
                <span>{tank.currentLevel.toFixed(2)}L</span>
              </div>
              <div className="flex justify-between text-sm text-gray-600">
                <span>Capacity</span>
                <span>{tank.capacity.toFixed(2)}L</span>
              </div>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2.5">
              <div
                className="bg-primary-600 h-2.5 rounded-full"
                style={{ width: `${(tank.currentLevel / tank.capacity) * 100}%` }}
              ></div>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              {((tank.currentLevel / tank.capacity) * 100).toFixed(1)}% full
            </p>
          </div>
        ))}
      </div>

      {currentShift && (
        <div className="bg-white shadow rounded-lg p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">
              Current Shift: {currentShift.shiftType} ({currentShift.status})
            </h2>
            {currentShift.locked && (
              <span className="px-3 py-1 bg-red-100 text-red-800 rounded-full text-sm font-semibold">
                Locked
              </span>
            )}
          </div>

          {!currentShift.locked && isSM && (
            <div className="mb-4">
              <h3 className="text-lg font-medium mb-3">Enter Closing Readings</h3>
              <div className="space-y-3">
                {nozzles.map((nozzle) => {
                  const existingReading = currentShift.shiftReadings.find(
                    (sr) => sr.nozzleId === nozzle.id
                  );
                  return (
                    <div key={nozzle.id} className="flex items-center space-x-4">
                      <label className="w-32 text-sm font-medium text-gray-700">
                        {nozzle.name}:
                      </label>
                      <span className="text-sm text-gray-500">
                        Opening: {existingReading?.openingReading.toFixed(2) || '0.00'}
                      </span>
                      <input
                        type="number"
                        step="0.01"
                        className="flex-1 rounded-md border-gray-300 shadow-sm"
                        placeholder="Closing reading"
                        value={readings[nozzle.id] || ''}
                        onChange={(e) => handleReadingChange(nozzle.id, e.target.value)}
                      />
                    </div>
                  );
                })}
              </div>
              <button
                onClick={handleSubmitReadings}
                className="mt-4 bg-primary-600 text-white px-4 py-2 rounded-md hover:bg-primary-700"
              >
                Submit & Lock Shift
              </button>
            </div>
          )}

          {currentShift.locked && (
            <div>
              <h3 className="text-lg font-medium mb-3">Shift Readings</h3>
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Nozzle
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Opening
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Closing
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Consumption
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {currentShift.shiftReadings.map((reading) => (
                    <tr key={reading.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {reading.nozzle.name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {reading.openingReading.toFixed(2)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {reading.closingReading?.toFixed(2) || 'N/A'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {reading.consumption?.toFixed(2) || 'N/A'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};


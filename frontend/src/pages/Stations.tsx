import { useState, useEffect } from 'react';
import api from '../services/api';

interface Station {
    id: string;
    name: string;
    address: string;
    areaManagerId?: string;
    areaManager?: { name: string };
}

interface User {
    id: string;
    name: string;
    role: string;
}

export const Stations = () => {
    const [stations, setStations] = useState<Station[]>([]);
    const [ams, setAms] = useState<User[]>([]);
    const [showForm, setShowForm] = useState(false);
    const [formData, setFormData] = useState({
        name: '',
        address: '',
    });

    useEffect(() => {
        loadStations();
        loadAMs();
    }, []);

    const loadStations = async () => {
        try {
            // Need to ensure backend returns areaManager relation. The controller uses findMany but no `with` clause for areaManager yet.
            // I should update controller to include relations or just fetch them separately?
            // Standard `getStations` didn't have relations. I should update it.
            // For now, let's assume valid data.
            const res = await api.get('/api/stations');
            setStations(res.data.stations);
        } catch (error) {
            console.error('Failed to load stations', error);
        }
    };

    const loadAMs = async () => {
        try {
            const res = await api.get('/api/users');
            const allUsers: User[] = res.data.users;
            setAms(allUsers.filter(u => u.role === 'AM'));
        } catch (error) {
            console.error('Failed to load AMs', error);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await api.post('/api/stations', formData);
            setShowForm(false);
            setFormData({ name: '', address: '' });
            loadStations();
            alert('Station created successfully');
        } catch (error: any) {
            alert(error.response?.data?.error || 'Failed to create station');
        }
    };

    const handleAssignAM = async (stationId: string, amId: string) => {
        try {
            await api.patch(`/api/stations/${stationId}`, {
                areaManagerId: amId || null // Send null if empty string to unassign
            });
            loadStations();
        } catch (error: any) {
            alert(error.response?.data?.error || 'Failed to update station');
        }
    };

    return (
        <div className="px-4 py-6 sm:px-0">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold text-gray-900">Stations Management</h1>
                <button
                    onClick={() => setShowForm(!showForm)}
                    className="bg-primary-600 text-white px-4 py-2 rounded-md hover:bg-primary-700"
                >
                    {showForm ? 'Cancel' : 'Add Station'}
                </button>
            </div>

            {showForm && (
                <div className="bg-white shadow rounded-lg p-6 mb-6">
                    <h2 className="text-xl font-semibold mb-4">Create New Station</h2>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Station Name</label>
                                <input
                                    type="text"
                                    required
                                    className="mt-1 block w-full rounded-md border border-gray-300 shadow-sm p-2"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Location / Address</label>
                                <input
                                    type="text"
                                    className="mt-1 block w-full rounded-md border border-gray-300 shadow-sm p-2"
                                    value={formData.address}
                                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                                />
                            </div>
                        </div>
                        <button
                            type="submit"
                            className="bg-primary-600 text-white px-4 py-2 rounded-md hover:bg-primary-700"
                        >
                            Create Station
                        </button>
                    </form>
                </div>
            )}

            <div className="bg-white shadow rounded-lg overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Station Name</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Location</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Area Manager</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {stations.map((s) => (
                            <tr key={s.id}>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{s.name}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{s.address}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                    <select
                                        className="mt-1 block w-full rounded-md border border-gray-300 shadow-sm p-1"
                                        value={s.areaManagerId || ''}
                                        onChange={(e) => handleAssignAM(s.id, e.target.value)}
                                    >
                                        <option value="">Unassigned</option>
                                        {ams.map(am => (
                                            <option key={am.id} value={am.id}>{am.name}</option>
                                        ))}
                                    </select>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

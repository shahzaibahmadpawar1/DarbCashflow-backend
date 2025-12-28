interface StatusBadgeProps {
  status: string;
}

export const StatusBadge = ({ status }: StatusBadgeProps) => {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'DEPOSITED':
        return 'bg-green-100 text-green-800';
      case 'WITH_AM':
        return 'bg-yellow-100 text-yellow-800';
      case 'PENDING_ACCEPTANCE':
        return 'bg-blue-100 text-blue-800';
      case 'LOCKED':
        return 'bg-red-100 text-red-800';
      case 'OPEN':
        return 'bg-green-100 text-green-800';
      case 'CLOSED':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <span
      className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(
        status
      )}`}
    >
      {status.replace('_', ' ')}
    </span>
  );
};


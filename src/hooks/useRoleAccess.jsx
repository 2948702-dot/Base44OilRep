import { useAuth } from '@/lib/AuthContext';

export function useRoleAccess() {
  const { user } = useAuth();

  const isAdmin = user?.role === 'admin';
  const isClientAdmin = user?.role === 'client_admin';
  const isSuperintendent = user?.role === 'superintendent';
  const isCaptain = user?.role === 'captain';
  const isLabTechnician = user?.role === 'lab_technician';
  const assignedAssetIds = [...new Set([
    user?.asset_id,
    ...(Array.isArray(user?.asset_ids) ? user.asset_ids : []),
  ].filter(Boolean))];
  const assignedAssetId = assignedAssetIds[0];
  const assignedClientId = user?.client_id;

  return {
    user,
    isAdmin,
    isClientAdmin,
    isSuperintendent,
    isCaptain,
    isLabTechnician,
    assignedAssetId,
    assignedAssetIds,
    assignedClientId,
    hasRole: (role) => user?.role === role,
  };
}

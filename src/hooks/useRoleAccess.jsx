import { useAuth } from '@/lib/AuthContext';

export function useRoleAccess() {
  const { user } = useAuth();

  const isAdmin = user?.role === 'admin';
  const isSuperintendent = user?.role === 'superintendent';
  const isCaptain = user?.role === 'captain';
  const assignedAssetId = user?.asset_id || user?.asset_ids?.[0];
  const assignedAssetIds = assignedAssetId ? [assignedAssetId] : [];
  const assignedClientId = user?.client_id;

  return {
    user,
    isAdmin,
    isSuperintendent,
    isCaptain,
    assignedAssetId,
    assignedAssetIds,
    assignedClientId,
    hasRole: (role) => user?.role === role,
  };
}

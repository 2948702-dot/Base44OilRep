import { useAuth } from '@/lib/AuthContext';

export function useRoleAccess() {
  const { user } = useAuth();

  const isAdmin = user?.role === 'admin';
  const isSuperintendent = user?.role === 'superintendent';
  const isCaptain = user?.role === 'captain';
  const assignedAssetId = user?.asset_id;
  const assignedClientId = user?.client_id;

  return {
    user,
    isAdmin,
    isSuperintendent,
    isCaptain,
    assignedAssetId,
    assignedClientId,
    hasRole: (role) => user?.role === role,
  };
}

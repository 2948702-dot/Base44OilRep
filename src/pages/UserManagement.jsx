import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { UserPlus, Trash2 } from 'lucide-react';

const ROLE_LABELS = {
  admin: 'Администратор',
  superintendent: 'Суперинтендант',
  captain: 'Ответственный за актив',
};

const ROLE_BADGES = {
  admin: 'bg-red-100 text-red-700',
  superintendent: 'bg-blue-100 text-blue-700',
  captain: 'bg-green-100 text-green-700',
};

const POSITION_LABELS = {
  captain: 'Капитан',
  chief_engineer: 'Главный инженер',
  chief_mechanic: 'Главный механик',
  mechanic: 'Механик',
  workshop_manager: 'Начальник цеха',
  site_foreman: 'Мастер участка',
  operator: 'Оператор',
  excavator_operator: 'Оператор экскаватора',
  driver: 'Водитель',
  asset_responsible: 'Ответственный за оборудование',
};

export default function UserManagement() {
  const queryClient = useQueryClient();
  const [showDialog, setShowDialog] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('captain');
  const [clientId, setClientId] = useState('');
  const [assetId, setAssetId] = useState('');
  const [positionTitle, setPositionTitle] = useState('asset_responsible');
  const [loading, setLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);

  const { data: users = [] } = useQuery({ queryKey: ['users'], queryFn: () => base44.entities.User.list() });
  const { data: assets = [] } = useQuery({ queryKey: ['assets'], queryFn: () => base44.entities.Asset.list() });
  const { data: clients = [] } = useQuery({ queryKey: ['clients'], queryFn: () => base44.entities.Client.list() });

  useEffect(() => {
    const getUser = async () => {
      const user = await base44.auth.me();
      setCurrentUser(user);
    };
    getUser();
  }, []);

  const availableAssets = useMemo(() => {
    if (currentUser?.role === 'superintendent') {
      return assets.filter(asset => asset.client_id === currentUser.client_id);
    }
    return assets;
  }, [assets, currentUser]);

  const findInvitedUser = async (targetEmail, invitationResult) => {
    const directUser = invitationResult?.user || invitationResult?.data || invitationResult;
    if (directUser?.id) return directUser;

    const normalizedEmail = targetEmail.trim().toLowerCase();
    const refreshedUsers = await base44.entities.User.list();
    return refreshedUsers.find(user => user.email?.toLowerCase() === normalizedEmail);
  };

  const resetForm = () => {
    setEmail('');
    setRole('captain');
    setClientId('');
    setAssetId('');
    setPositionTitle('asset_responsible');
  };

  const handleInvite = async () => {
    if (!email || !role) return;

    if (!currentUser) {
      alert('Не удалось определить текущего пользователя.');
      return;
    }

    if (currentUser.role === 'captain') {
      alert('У ответственного за актив нет прав приглашать пользователей.');
      return;
    }

    if (currentUser.role === 'superintendent' && role !== 'captain') {
      alert('Суперинтендант может приглашать только ответственных за активы своего клиента.');
      return;
    }

    if (role === 'superintendent' && !clientId) {
      alert('Выберите клиента для суперинтенданта.');
      return;
    }

    if (role === 'captain' && !assetId) {
      alert('Выберите актив для ответственного.');
      return;
    }

    const selectedAsset = availableAssets.find(asset => asset.id === assetId);
    if (role === 'captain' && currentUser.role === 'superintendent' && selectedAsset?.client_id !== currentUser.client_id) {
      alert('Можно назначить только актив своего клиента.');
      return;
    }

    const assignment = {
      role,
      client_id: role === 'superintendent' ? clientId : role === 'captain' ? selectedAsset?.client_id || '' : '',
      asset_id: role === 'captain' ? selectedAsset?.id || '' : '',
      asset_ids: role === 'captain' && selectedAsset?.id ? [selectedAsset.id] : [],
      position_title: role === 'captain' ? positionTitle : '',
    };

    setLoading(true);
    try {
      const invitationResult = await base44.users.inviteUser(email.trim(), role);
      const invitedUser = await findInvitedUser(email, invitationResult);

      if (invitedUser?.id) {
        await base44.entities.User.update(invitedUser.id, assignment);
      } else {
        alert('Приглашение отправлено, но запись пользователя не найдена для назначения клиента/актива. Проверьте пользователя после принятия приглашения.');
      }

      resetForm();
      setShowDialog(false);
      queryClient.invalidateQueries({ queryKey: ['users'] });
    } catch (error) {
      console.error('Invite error:', error);
      alert(`Ошибка при приглашении: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = async (userId) => {
    if (!confirm('Удалить пользователя?')) return;
    try {
      await base44.entities.User.delete(userId);
      queryClient.invalidateQueries({ queryKey: ['users'] });
    } catch (error) {
      alert(`Ошибка при удалении: ${error.message}`);
    }
  };

  const getAssignmentLabel = (user) => {
    if (user.role === 'superintendent') {
      return clients.find(client => client.id === user.client_id)?.company_name || '-';
    }

    const id = user.asset_id || user.asset_ids?.[0];
    return assets.find(asset => asset.id === id)?.asset_name || '-';
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Управление пользователями</h1>
        <Button onClick={() => setShowDialog(true)} className="gap-2">
          <UserPlus className="w-4 h-4" />
          Пригласить пользователя
        </Button>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">Email</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">Имя</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">Роль</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">Должность</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">Назначение</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">Действия</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {users.map(user => {
              const roleClass = ROLE_BADGES[user.role] || 'bg-slate-100 text-slate-700';
              const roleLabel = ROLE_LABELS[user.role] || user.role || 'Не задана';
              const positionLabel = user.role === 'captain'
                ? POSITION_LABELS[user.position_title] || POSITION_LABELS.asset_responsible
                : '-';

              return (
                <tr key={user.id} className="hover:bg-slate-50">
                  <td className="px-6 py-4 text-sm text-slate-900">{user.email}</td>
                  <td className="px-6 py-4 text-sm text-slate-900">{user.full_name || '-'}</td>
                  <td className="px-6 py-4 text-sm">
                    <span className={`px-2 py-1 rounded text-xs font-semibold ${roleClass}`}>
                      {roleLabel}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600">{positionLabel}</td>
                  <td className="px-6 py-4 text-sm text-slate-600">{getAssignmentLabel(user)}</td>
                  <td className="px-6 py-4 text-sm">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDeleteUser(user.id)}
                    >
                      <Trash2 className="w-4 h-4 text-red-600" />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Пригласить нового пользователя</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium text-slate-900 block mb-1">Email</label>
              <Input
                type="email"
                placeholder="user@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-900 block mb-1">Роль доступа</label>
              <Select value={role} onValueChange={(value) => { setRole(value); setAssetId(''); }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {currentUser?.role === 'admin' && (
                    <>
                      <SelectItem value="admin">Администратор</SelectItem>
                      <SelectItem value="superintendent">Суперинтендант</SelectItem>
                    </>
                  )}
                  <SelectItem value="captain">Ответственный за актив</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {currentUser?.role === 'admin' && role === 'superintendent' && (
              <div>
                <label className="text-sm font-medium text-slate-900 block mb-1">Клиент</label>
                <Select value={clientId} onValueChange={setClientId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Выберите клиента..." />
                  </SelectTrigger>
                  <SelectContent>
                    {clients.map(client => (
                      <SelectItem key={client.id} value={client.id}>
                        {client.company_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {role === 'captain' && (
              <>
                <div>
                  <label className="text-sm font-medium text-slate-900 block mb-1">Должность</label>
                  <Select value={positionTitle} onValueChange={setPositionTitle}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(POSITION_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-900 block mb-1">Актив</label>
                  <Select value={assetId} onValueChange={setAssetId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Выберите актив..." />
                    </SelectTrigger>
                    <SelectContent>
                      {availableAssets.map(asset => {
                        const clientName = clients.find(client => client.id === asset.client_id)?.company_name;
                        return (
                          <SelectItem key={asset.id} value={asset.id}>
                            {asset.asset_name}{clientName ? ` · ${clientName}` : ''}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Отмена</Button>
            <Button onClick={handleInvite} disabled={loading || !email}>
              {loading ? 'Отправка...' : 'Пригласить'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

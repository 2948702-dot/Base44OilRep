import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { UserPlus, Trash2 } from 'lucide-react';

export default function UserManagement() {
  const queryClient = useQueryClient();
  const [showDialog, setShowDialog] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('user');
  const [clientId, setClientId] = useState('');
  const [assetId, setAssetId] = useState('');
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

  const handleInvite = async () => {
    if (!email || !role) return;

    if (!currentUser) {
      alert('Ошибка: не удалось определить текущего пользователя');
      return;
    }

    if (currentUser.role === 'user') {
      alert('Ошибка: у вас нет прав для приглашения пользователей');
      return;
    }

    if (currentUser.role === 'superintendent' && role === 'admin') {
      alert('Ошибка: только администратор может приглашать администраторов');
      return;
    }

    if (currentUser.role === 'superintendent' && role === 'superintendent') {
      alert('Ошибка: только администратор может приглашать суперинтендантов');
      return;
    }

    if (currentUser.role === 'superintendent' && role === 'user' && !assetId) {
      alert('Ошибка: выберите судно для пользователя');
      return;
    }

    setLoading(true);
    try {
      await base44.users.inviteUser(email, role);

      setEmail('');
      setRole('user');
      setClientId('');
      setAssetId('');
      setShowDialog(false);
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.refetchQueries({ queryKey: ['users'] });
    } catch (error) {
      console.error('Invite error:', error);
      alert('Ошибка при приглашении: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = async (userId) => {
    if (!confirm('Вы уверены?')) return;
    try {
      await base44.entities.User.delete(userId);
      queryClient.invalidateQueries({ queryKey: ['users'] });
    } catch (error) {
      alert('Ошибка при удалении: ' + error.message);
    }
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

      {/* Users Table */}
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">Email</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">Имя</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">Роль</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">Назначение</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">Действия</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {users.map(user => {
              const assignedAsset = user.asset_id ? assets.find(a => a.id === user.asset_id) : null;
              const assignedClient = user.client_id ? clients.find(c => c.id === user.client_id) : null;
              return (
                <tr key={user.id} className="hover:bg-slate-50">
                  <td className="px-6 py-4 text-sm text-slate-900">{user.email}</td>
                  <td className="px-6 py-4 text-sm text-slate-900">{user.full_name || '—'}</td>
                  <td className="px-6 py-4 text-sm">
                    <span className={`px-2 py-1 rounded text-xs font-semibold ${
                      user.role === 'admin' ? 'bg-red-100 text-red-700' :
                      user.role === 'superintendent' ? 'bg-blue-100 text-blue-700' :
                      'bg-green-100 text-green-700'
                    }`}>
                      {user.role === 'admin' ? 'Администратор' : 
                       user.role === 'superintendent' ? 'Суперинтендант' : 'Капитан'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600">
                    {assignedAsset?.asset_name || assignedClient?.company_name || '—'}
                  </td>
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

      {/* Invite Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
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
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-900 block mb-1">Роль</label>
              <Select value={role} onValueChange={setRole}>
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
                  <SelectItem value="user">Капитан</SelectItem>
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
            {role === 'user' && (
              <div>
                <label className="text-sm font-medium text-slate-900 block mb-1">Судно</label>
                <Select value={assetId} onValueChange={setAssetId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Выберите судно..." />
                  </SelectTrigger>
                  <SelectContent>
                    {currentUser?.role === 'superintendent' 
                      ? assets.filter(a => a.client_id === currentUser.client_id).map(asset => (
                          <SelectItem key={asset.id} value={asset.id}>
                            {asset.asset_name}
                          </SelectItem>
                        ))
                      : assets.map(asset => (
                          <SelectItem key={asset.id} value={asset.id}>
                            {asset.asset_name}
                          </SelectItem>
                        ))
                    }
                  </SelectContent>
                </Select>
              </div>
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
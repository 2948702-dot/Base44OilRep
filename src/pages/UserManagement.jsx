import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
  const [role, setRole] = useState('superintendent');
  const [assetId, setAssetId] = useState('');
  const [loading, setLoading] = useState(false);

  const { data: users = [] } = useQuery({ queryKey: ['users'], queryFn: () => base44.entities.User.list() });
  const { data: assets = [] } = useQuery({ queryKey: ['assets'], queryFn: () => base44.entities.Asset.list() });

  const handleInvite = async () => {
    if (!email || !role) return;
    
    setLoading(true);
    try {
      await base44.users.inviteUser(email, role);
      
      // Если капитан, сохраняем asset_id
      if (role === 'captain' && assetId) {
        // После регистрации пользователем, капитан должен получить asset_id
        // Можно добавить note в приглашение или обновить после регистрации
      }

      setEmail('');
      setRole('superintendent');
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
              <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">Назначенное судно</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">Действия</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {users.map(user => {
              const assignedAsset = user.asset_id ? assets.find(a => a.id === user.asset_id) : null;
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
                  <td className="px-6 py-4 text-sm text-slate-600">{assignedAsset?.asset_name || '—'}</td>
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
                  <SelectItem value="admin">Администратор</SelectItem>
                  <SelectItem value="superintendent">Суперинтендант</SelectItem>
                  <SelectItem value="captain">Капитан</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {role === 'captain' && (
              <div>
                <label className="text-sm font-medium text-slate-900 block mb-1">Назначить судно</label>
                <Select value={assetId} onValueChange={setAssetId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Выберите судно..." />
                  </SelectTrigger>
                  <SelectContent>
                    {assets.map(asset => (
                      <SelectItem key={asset.id} value={asset.id}>
                        {asset.asset_name}
                      </SelectItem>
                    ))}
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
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Avatar } from '@/components/ui/Avatar';
import { EmailPreferences } from '@/components/account/EmailPreferences';
import { supabase } from '@/lib/supabase';

export default function AccountPage() {
  const { user, signOut, updatePassword } = useAuth();
  const { toast } = useToast();
  const router = useRouter();

  const [fullName, setFullName] = useState(user?.full_name ?? '');
  const [saving, setSaving] = useState(false);

  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from('profiles').update({ full_name: fullName }).eq('id', user.id);
    if (error) {
      toast('Failed to save changes.', 'error');
    } else {
      toast('Profile updated!', 'success');
    }
    setSaving(false);
  };

  const handlePasswordChange = async () => {
    if (newPassword.length < 8) {
      toast('Password must be at least 8 characters.', 'error');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast('Passwords do not match.', 'error');
      return;
    }
    setChangingPassword(true);
    try {
      await updatePassword(newPassword);
      toast('Password updated!', 'success');
      setShowPasswordForm(false);
      setNewPassword('');
      setConfirmPassword('');
    } catch {
      toast('Failed to update password.', 'error');
    }
    setChangingPassword(false);
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirm !== 'DELETE') return;
    setDeleting(true);
    try {
      await supabase.from('profiles').delete().eq('id', user!.id);
      await signOut();
      router.push('/');
    } catch {
      toast('Failed to delete account.', 'error');
      setDeleting(false);
    }
  };

  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold text-ink">My Account</h1>

      {/* Profile section */}
      <div className="mb-8 rounded-lg border border-line p-6">
        <div className="mb-4 flex items-center gap-4">
          <Avatar src={user?.avatar_url} alt={user?.full_name ?? user?.email ?? ''} size="lg" />
          <div>
            <p className="font-medium text-ink">{user?.full_name ?? 'No name set'}</p>
            <p className="text-sm text-muted">{user?.email}</p>
          </div>
        </div>

        <div className="space-y-4">
          <Input
            label="Full Name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
          <Input label="Email" value={user?.email ?? ''} disabled />
          <Input label="Role" value={user?.role ?? ''} disabled />
          <Button onClick={handleSave} loading={saving}>Save Changes</Button>
        </div>
      </div>

      <EmailPreferences />

      {/* Password section */}
      <div className="mb-8 rounded-lg border border-line p-6">
        <h2 className="mb-4 text-lg font-semibold text-ink">Password</h2>
        {showPasswordForm ? (
          <div className="space-y-4">
            <Input
              label="New Password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Minimum 8 characters"
            />
            <Input
              label="Confirm Password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
            <div className="flex gap-2">
              <Button onClick={handlePasswordChange} loading={changingPassword}>
                Update Password
              </Button>
              <Button variant="outline" onClick={() => { setShowPasswordForm(false); setNewPassword(''); setConfirmPassword(''); }}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="outline" onClick={() => setShowPasswordForm(true)}>
            Change Password
          </Button>
        )}
      </div>

      {/* Danger zone */}
      <div className="rounded-lg border border-red-200 p-6">
        <h2 className="mb-2 text-lg font-semibold text-red-700">Danger Zone</h2>
        <p className="mb-4 text-sm text-muted">
          Permanently delete your account and all associated data. This action cannot be undone.
        </p>
        <Button variant="danger" onClick={() => setShowDeleteModal(true)}>
          Delete Account
        </Button>
      </div>

      <Modal
        isOpen={showDeleteModal}
        title="Delete Account"
        onClose={() => { setShowDeleteModal(false); setDeleteConfirm(''); }}
      >
        <div className="space-y-4">
          <p className="text-sm text-muted">
            This will permanently delete your account, profile, and all associated data.
            This action cannot be undone.
          </p>
          <div>
            <label className="mb-1 block text-sm font-medium text-ink">
              Type <strong>DELETE</strong> to confirm
            </label>
            <Input
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              placeholder="DELETE"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => { setShowDeleteModal(false); setDeleteConfirm(''); }}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={handleDeleteAccount}
              loading={deleting}
              disabled={deleteConfirm !== 'DELETE'}
            >
              Delete My Account
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

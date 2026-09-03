'use client';

import { useState } from 'react';
import { captureException } from '@/lib/sentry';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Avatar } from '@/components/ui/Avatar';
import { EmailPreferences } from '@/components/account/EmailPreferences';
import { useMature } from '@/context/MatureContext';
import { supabase } from '@/lib/supabase';

export default function AccountPage() {
  const { user, signOut, updatePassword } = useAuth();
  const { showMature, setShowMature } = useMature();
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
  // A 409 refusal (open order) stays readable inside the dialog — a toast
  // alone slides away before "contact support" has been read.
  const [deleteBlocked, setDeleteBlocked] = useState<string | null>(null);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    // .select('id').maybeSingle(): a zero-row update (RLS refusal) must fail
    // visibly instead of toasting success over an unsaved name.
    const { data: updated, error } = await supabase
      .from('profiles').update({ full_name: fullName }).eq('id', user.id).select('id').maybeSingle();
    if (error || !updated) {
      captureException(error ?? new Error('account name save matched zero rows'), { where: 'account.saveName' });
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
    } catch (err) {
      captureException(err, { where: 'account.updatePassword' });
      toast('Failed to update password.', 'error');
    }
    setChangingPassword(false);
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirm !== 'DELETE') return;
    setDeleting(true);
    setDeleteBlocked(null);
    try {
      // Server-side: the client-side profiles.delete() was an RLS no-op that
      // never touched the auth user — the account survived deletion.
      const res = await fetch('/api/account/delete', { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const message = typeof body.error === 'string' ? body.error : 'Failed';
        if (res.status === 409) {
          // Expected refusal (party to an open order), not a failure.
          setDeleteBlocked(message);
          toast(message, 'warning');
          setDeleting(false);
          return;
        }
        throw new Error(message);
      }
      await signOut().catch(() => {});
      router.push('/');
    } catch (err) {
      captureException(err, { where: 'account.delete' });
      toast(err instanceof Error && err.message !== 'Failed' ? err.message : 'Failed to delete account.', 'error');
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

      {/* Ruling D8. Lives here as well as in the feed filters because this is
          where someone comes looking to turn it back off. */}
      <section className="mt-8 rounded-xl border border-line bg-surface p-6 shadow-card">
        <h2 className="mb-2 text-lg font-semibold text-ink">Browsing</h2>
        <label className="flex items-start gap-3 text-sm text-ink">
          <input
            type="checkbox"
            checked={showMature}
            onChange={(e) => setShowMature(e.target.checked)}
            className="mt-0.5 rounded border-line"
          />
          <span>
            Show mature work
            <span className="mt-0.5 block text-xs text-muted">
              Artists tag work containing nudity or mature themes. With this off, tagged pieces are
              kept out of browsing and shown behind a notice if you open one directly. Remembered
              in this browser only.
            </span>
          </span>
        </label>
      </section>

      {/* Password section */}
      <div className="mb-8 rounded-lg border border-line p-6">
        <h2 className="mb-4 text-lg font-semibold text-ink">Password</h2>
        {showPasswordForm ? (
          // A real <form>: Enter submits, and password managers get the
          // new-password hint instead of offering to fill the old one.
          <form
            className="space-y-4"
            onSubmit={(e) => { e.preventDefault(); void handlePasswordChange(); }}
          >
            <Input
              label="New Password"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Minimum 8 characters"
            />
            <Input
              label="Confirm Password"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
            <div className="flex gap-2">
              <Button type="submit" loading={changingPassword}>
                Update Password
              </Button>
              <Button type="button" variant="outline" onClick={() => { setShowPasswordForm(false); setNewPassword(''); setConfirmPassword(''); }}>
                Cancel
              </Button>
            </div>
          </form>
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
        onClose={() => { setShowDeleteModal(false); setDeleteConfirm(''); setDeleteBlocked(null); }}
      >
        <div className="space-y-4">
          <p className="text-sm text-muted">
            This will permanently delete your account, profile, and all associated data.
            This action cannot be undone.
          </p>
          {deleteBlocked && (
            <p role="alert" className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {deleteBlocked}
            </p>
          )}
          <Input
            label="Type DELETE to confirm"
            value={deleteConfirm}
            onChange={(e) => setDeleteConfirm(e.target.value)}
            placeholder="DELETE"
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => { setShowDeleteModal(false); setDeleteConfirm(''); setDeleteBlocked(null); }}>
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

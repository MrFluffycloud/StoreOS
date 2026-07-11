"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getUsers, createUser, updateUser, deleteUser } from "@/lib/ipc";
import { useAuth } from "@/components/layout/app-layout";
import { Plus, Edit2, Trash2, Shield, Key, Eye, EyeOff, Users } from "lucide-react";
import { useAlerts } from "@/components/providers/alert-provider";

export default function UserAccountsManager() {
  const queryClient = useQueryClient();
  const { showAlert, showConfirm } = useAlerts();
  const { session } = useAuth();
  const currentUsername = session?.username || "";

  // Dialog States
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<any | null>(null);

  // Form States
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [role, setRole] = useState("Cashier");
  const [error, setError] = useState<string | null>(null);

  // Toggle PIN visibility in the list
  const [showPins, setShowPins] = useState<Record<string, boolean>>({});

  // Query users from SQLite
  const { data: users = [], isLoading } = useQuery({
    queryKey: ["users"],
    queryFn: getUsers,
  });

  const togglePinVisibility = (userId: string) => {
    setShowPins((prev) => ({ ...prev, [userId]: !prev[userId] }));
  };

  const handleOpenCreate = () => {
    setEditingUser(null);
    setUsername("");
    setPin("");
    setRole("Cashier");
    setError(null);
    setDialogOpen(true);
  };

  const handleOpenEdit = (user: any) => {
    setEditingUser(user);
    setUsername(user.username);
    setPin(user.pin);
    setRole(user.role);
    setError(null);
    setDialogOpen(true);
  };

  // Create User Mutation
  const createMutation = useMutation({
    mutationFn: (input: { username: string; pin: string; role: string }) => createUser(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setDialogOpen(false);
    },
    onError: (err: any) => {
      setError(err.message || err.toString() || "Failed to create user.");
    },
  });

  // Update User Mutation
  const updateMutation = useMutation({
    mutationFn: (input: { id: string; username: string; pin: string; role: string }) =>
      updateUser(input.id, input.username, input.pin, input.role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setDialogOpen(false);
    },
    onError: (err: any) => {
      setError(err.message || err.toString() || "Failed to update user.");
    },
  });

  // Delete User Mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteUser(id, currentUsername),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: async (err: any) => {
      await showAlert(err.message || err.toString() || "Failed to delete user.", "Error", "error");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!username.trim()) {
      setError("Username is required.");
      return;
    }

    if (pin.length !== 4 || !/^\d+$/.test(pin)) {
      setError("PIN must be exactly 4 digits.");
      return;
    }

    if (editingUser) {
      updateMutation.mutate({ id: editingUser.id, username, pin, role });
    } else {
      createMutation.mutate({ username, pin, role });
    }
  };

  const handleDeleteClick = async (user: any) => {
    if (user.username === currentUsername) {
      await showAlert("Security Error: You cannot delete your own active administrator account.", "Security Error", "error");
      return;
    }

    const isConfirmed = await showConfirm(
      `Are you sure you want to delete the user account for "${user.username}"?\n\n` +
      "This will permanently block their PIN access key.",
      "Delete User"
    );
    if (isConfirmed) {
      deleteMutation.mutate(user.id);
    }
  };

  if (isLoading) {
    return <div className="h-48 flex items-center justify-center text-xs text-muted-foreground">Loading accounts...</div>;
  }

  return (
    <div className="space-y-6">
      <Card className="border border-border bg-card shadow-sm select-none">
        <CardHeader className="border-b border-border/55 pb-4 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <Users className="w-4 h-4" /> System Accounts & Roles
          </CardTitle>
          <Button onClick={handleOpenCreate} size="sm" className="h-8 text-xs font-semibold flex items-center gap-1">
            <Plus className="w-3.5 h-3.5" /> Add Account
          </Button>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-border/60 text-muted-foreground uppercase font-bold tracking-wider text-[10px]">
                  <th className="py-2.5 px-3">Employee Name</th>
                  <th className="py-2.5 px-3">Role / Permissions</th>
                  <th className="py-2.5 px-3">PIN Key</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const isSelf = u.username === currentUsername;
                  const isPinVisible = showPins[u.id] || false;

                  return (
                    <tr key={u.id} className="border-b border-border/40 hover:bg-muted/10 transition-colors">
                      <td className="py-3 px-3 font-semibold text-foreground">
                        {u.username} {isSelf && <span className="text-[9px] bg-primary/10 text-primary px-1.5 py-0.5 rounded ml-1.5 font-normal">Active Self</span>}
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold ${
                            u.role === "Admin"
                              ? "bg-purple-500/10 text-purple-600 dark:text-purple-400"
                              : u.role === "Cashier"
                              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                              : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                          }`}
                        >
                          <Shield className="w-3 h-3" />
                          {u.role}
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-semibold tracking-wider text-muted-foreground w-12 text-center">
                            {isPinVisible ? u.pin : "••••"}
                          </span>
                          <button
                            type="button"
                            onClick={() => togglePinVisibility(u.id)}
                            className="p-1 rounded hover:bg-muted text-muted-foreground transition-colors"
                            title={isPinVisible ? "Hide PIN" : "Show PIN"}
                          >
                            {isPinVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="ghost"
                            onClick={() => handleOpenEdit(u)}
                            className="w-7 h-7 p-0 hover:bg-muted rounded-md"
                            title="Edit Account"
                          >
                            <Edit2 className="w-3.5 h-3.5 text-muted-foreground" />
                          </Button>
                          <Button
                            variant="ghost"
                            onClick={() => handleDeleteClick(u)}
                            disabled={isSelf}
                            className="w-7 h-7 p-0 hover:bg-rose-500/10 rounded-md disabled:opacity-30"
                            title={isSelf ? "Self Deletion Disabled" : "Delete Account"}
                          >
                            <Trash2 className={`w-3.5 h-3.5 ${isSelf ? "text-muted-foreground/30" : "text-rose-500"}`} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Account Creation/Edition Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[340px] bg-card border-border select-none">
          <DialogHeader className="border-b border-border/80 pb-3">
            <DialogTitle className="text-sm font-bold text-foreground">
              {editingUser ? "Edit User Account" : "Add New Account"}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 pt-3 text-xs">
            <div className="space-y-1.5">
              <Label htmlFor="username" className="font-semibold text-foreground">Employee Username</Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. Arthur Dent"
                className="h-8.5 text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pin" className="font-semibold text-foreground flex items-center justify-between">
                <span>Unique login PIN</span>
                <span className="text-[9px] text-muted-foreground font-mono">Exactly 4 digits</span>
              </Label>
              <div className="relative">
                <Key className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  id="pin"
                  maxLength={4}
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  placeholder="e.g. 5678"
                  className="h-8.5 pl-8.5 text-xs font-mono"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="role" className="font-semibold text-foreground">Access Level / Role</Label>
              <select
                id="role"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="flex h-8.5 w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-primary text-foreground"
              >
                <option value="Cashier">Cashier (POS & Sales only)</option>
                <option value="Auditor">Auditor (Analytics, Stock, Suppliers only)</option>
                <option value="Admin">Administrator (Full Access)</option>
              </select>
            </div>

            {error && <p className="text-[10px] text-rose-500 font-semibold text-center mt-1">{error}</p>}

            <div className="flex gap-2 pt-3 border-t border-border/80 mt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
                className="flex-1 h-8.5 text-xs"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
                className="flex-1 h-8.5 text-xs bg-primary hover:bg-primary/95 text-primary-foreground font-semibold"
              >
                {editingUser ? "Save Changes" : "Create User"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

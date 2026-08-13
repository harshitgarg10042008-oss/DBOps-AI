export function canAccessWorkspace(userId: number, workspaceId: number, membership: { userId: number; workspaceId: number } | null | undefined) {
  return Boolean(membership && membership.userId === userId && membership.workspaceId === workspaceId);
}

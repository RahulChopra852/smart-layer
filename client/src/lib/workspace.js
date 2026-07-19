import { createContext, useContext } from 'react';

// Holds the active workspace id so useApi can attach it as x-workspace-id on every request
// without every call site having to pass it through explicitly.
export const WorkspaceContext = createContext(null);

export function useWorkspace() {
  return useContext(WorkspaceContext);
}

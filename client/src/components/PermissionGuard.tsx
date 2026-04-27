import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../store/auth'

export default function PermissionGuard({ permission, children }: { permission: string | string[], children: JSX.Element }) {
  const hasPermission = useAuthStore(s => s.hasPermission)
  const user = useAuthStore(s => s.user)

  if (!user) return <Navigate to="/login" />
  const required = Array.isArray(permission) ? permission : [permission]
  if (!required.some(p => hasPermission(p))) return <Navigate to="/" />
  
  return children
}

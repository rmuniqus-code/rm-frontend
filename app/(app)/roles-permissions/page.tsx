/**
 * /roles-permissions — redirected to /admin?tab=permissions
 * Users and Roles & Permissions are now consolidated in the Admin panel.
 */
import { redirect } from 'next/navigation'

export default function RolesPermissionsRedirect() {
  redirect('/admin')
}

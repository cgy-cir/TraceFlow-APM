import { http } from './http'
import type { PagedResponse } from './client'

export type UserRole = 'admin' | 'member'
export type UserStatus = 'active' | 'disabled'
export interface ConsoleUser {
  id: number
  email: string
  displayName: string
  role: UserRole
  status: UserStatus
  createdAt: number
  updatedAt: number
  lastLoginAt: number | null
}
export interface UserInput {
  email: string
  displayName: string
  password: string
  role: UserRole
}
export type UserUpdate = Pick<ConsoleUser, 'displayName' | 'role' | 'status'>
export interface UserFilters {
  query?: string
  role?: UserRole
  status?: UserStatus
  page: number
}

export async function getCurrentUser(): Promise<ConsoleUser | null> {
  return (await http.get<ConsoleUser | ''>('/api/v1/auth/me')).data || null
}
export async function login(values: { email: string; password: string }) {
  return (
    await http.post<ConsoleUser>(
      '/api/v1/auth/login',
      new URLSearchParams(values),
    )
  ).data
}
export async function logout() {
  await http.post('/api/v1/auth/logout')
}
export async function changePassword(values: {
  currentPassword: string
  password: string
}) {
  await http.post('/api/v1/auth/password', values)
}
export async function listUsers(filters: UserFilters) {
  return (
    await http.get<PagedResponse<ConsoleUser>>('/api/v1/users', {
      params: filters,
    })
  ).data
}
export async function createUser(values: UserInput) {
  return (await http.post<ConsoleUser>('/api/v1/users', values)).data
}
export async function updateUser(id: number, values: UserUpdate) {
  return (await http.patch<ConsoleUser>(`/api/v1/users/${id}`, values)).data
}
export async function resetUserPassword(id: number, password: string) {
  await http.post(`/api/v1/users/${id}/password`, { password })
}

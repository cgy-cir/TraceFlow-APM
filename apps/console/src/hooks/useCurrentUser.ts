import { useQuery } from '@tanstack/react-query'
import { getCurrentUser } from '../api/users'

export const CURRENT_USER_KEY = ['current-user'] as const
export function useCurrentUser() {
  return useQuery({
    queryKey: CURRENT_USER_KEY,
    queryFn: getCurrentUser,
    retry: false,
    refetchOnWindowFocus: true,
  })
}

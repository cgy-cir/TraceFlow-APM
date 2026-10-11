import {
  EditOutlined,
  LockOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
} from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Alert,
  Button,
  Input,
  Modal,
  Select,
  Switch,
  Table,
  Tag,
  Tooltip,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useState } from 'react'
import { apiErrorMessage } from '../api/http'
import {
  listUsers,
  updateUser,
  type ConsoleUser,
  type UserFilters,
  type UserStatus,
} from '../api/users'
import { ResetPasswordModal } from '../components/ResetPasswordModal'
import { UserEditorModal } from '../components/UserEditorModal'
import { CURRENT_USER_KEY, useCurrentUser } from '../hooks/useCurrentUser'
import { formatDateTime } from './issuePresentation'

const roles = [
  { label: '管理员', value: 'admin' },
  { label: '成员', value: 'member' },
]

export function UsersPage() {
  const { data: currentUser } = useCurrentUser()
  const queryClient = useQueryClient()
  const [filters, setFilters] = useState<UserFilters>({ page: 1 })
  const [editing, setEditing] = useState<ConsoleUser | null>(null)
  const [open, setOpen] = useState(false)
  const [resetTarget, setResetTarget] = useState<ConsoleUser | null>(null)
  const [modal, contextHolder] = Modal.useModal()
  const usersQuery = useQuery({
    queryKey: ['users', filters],
    queryFn: () => listUsers(filters),
    enabled: currentUser?.role === 'admin',
  })
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['users'] }),
      queryClient.invalidateQueries({ queryKey: CURRENT_USER_KEY }),
    ])
  }
  const statusMutation = useMutation({
    mutationFn: ({ user, status }: { user: ConsoleUser; status: UserStatus }) =>
      updateUser(user.id, {
        displayName: user.displayName,
        role: user.role,
        status,
      }),
    onSuccess: refresh,
  })
  const edit = (user: ConsoleUser | null) => {
    setEditing(user)
    setOpen(true)
  }
  // React vs Vue: 用函数式更新合并最新 state；直接修改 filters 不会触发重新渲染。
  const updateFilters = (values: Partial<UserFilters>) =>
    setFilters((previous) => ({ ...previous, ...values, page: 1 }))
  const columns: ColumnsType<ConsoleUser> = [
    {
      title: '用户',
      dataIndex: 'displayName',
      width: 250,
      render: (name: string, user) => (
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium" title={name}>
              {name}
            </span>
            {user.id === currentUser?.id && <Tag variant="filled">你</Tag>}
          </div>
          <span className="truncate text-xs text-[#667085]" title={user.email}>
            {user.email}
          </span>
        </div>
      ),
    },
    {
      title: '角色',
      dataIndex: 'role',
      width: 100,
      render: (role: string) => (
        <Tag
          variant="filled"
          color={role === 'admin' ? 'processing' : 'default'}
        >
          {role === 'admin' ? '管理员' : '成员'}
        </Tag>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: (status: string) => (
        <span className="flex items-center gap-2 text-xs">
          <span
            className={`h-1.5 w-1.5 rounded-full ${status === 'active' ? 'bg-[#16a34a]' : 'bg-[#98a2b3]'}`}
          />
          {status === 'active' ? '已启用' : '已禁用'}
        </span>
      ),
    },
    {
      title: '最近登录',
      dataIndex: 'lastLoginAt',
      width: 180,
      render: (value: number | null) =>
        value ? formatDateTime(value) : '尚未登录',
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      width: 180,
      render: formatDateTime,
    },
    {
      title: '操作',
      key: 'actions',
      width: 160,
      render: (_, user) => (
        <div className="flex items-center gap-2">
          <Tooltip title="编辑用户">
            <Button
              aria-label={`编辑 ${user.email}`}
              size="small"
              type="text"
              icon={<EditOutlined />}
              onClick={() => edit(user)}
            />
          </Tooltip>
          <Tooltip
            title={
              user.id === currentUser?.id
                ? '请通过账号菜单修改自己的密码'
                : '重置密码'
            }
          >
            <Button
              aria-label={`重置密码 ${user.email}`}
              size="small"
              type="text"
              icon={<LockOutlined />}
              disabled={user.id === currentUser?.id}
              onClick={() => setResetTarget(user)}
            />
          </Tooltip>
          <Tooltip
            title={
              user.id === currentUser?.id
                ? '不能禁用自己的账号'
                : user.status === 'active'
                  ? '禁用账号'
                  : '启用账号'
            }
          >
            <Switch
              aria-label={`启用账号 ${user.email}`}
              size="small"
              checked={user.status === 'active'}
              disabled={user.id === currentUser?.id || statusMutation.isPending}
              onChange={(checked) => {
                if (checked) statusMutation.mutate({ user, status: 'active' })
                else
                  modal.confirm({
                    title: `禁用 ${user.displayName}？`,
                    content: '该用户的现有登录将失效，并且无法再次登录。',
                    okText: '禁用',
                    cancelText: '取消',
                    okButtonProps: { danger: true },
                    onOk: () =>
                      statusMutation.mutateAsync({ user, status: 'disabled' }),
                  })
              }}
            />
          </Tooltip>
        </div>
      ),
    },
  ]

  if (currentUser?.role !== 'admin')
    return <Alert type="warning" showIcon title="需要管理员权限" />
  return (
    <div className="monitoring-page flex min-w-0 flex-col gap-6">
      {contextHolder}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <h1 className="m-0 text-2xl font-semibold text-[#101828]">
            用户管理
          </h1>
          <span className="text-sm text-[#667085]">
            {usersQuery.data?.total ?? 0} 位用户
          </span>
        </div>
        <div className="flex gap-2">
          <Tooltip title="刷新用户列表">
            <Button
              aria-label="刷新用户列表"
              icon={<ReloadOutlined spin={usersQuery.isFetching} />}
              disabled={usersQuery.isFetching}
              onClick={() => void usersQuery.refetch()}
            />
          </Tooltip>
          <Button
            aria-label="创建用户"
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => edit(null)}
          >
            创建用户
          </Button>
        </div>
      </header>
      <div className="grid grid-cols-1 gap-3 border-y border-[#e4e7ec] py-4 sm:grid-cols-[minmax(180px,1fr)_140px_140px]">
        <Input.Search
          aria-label="搜索用户"
          placeholder="姓名或邮箱"
          prefix={<SearchOutlined />}
          allowClear
          onSearch={(query) =>
            updateFilters({ query: query.trim() || undefined })
          }
        />
        <Select
          aria-label="用户角色"
          placeholder="全部角色"
          allowClear
          options={roles}
          value={filters.role}
          onChange={(role) => updateFilters({ role })}
        />
        <Select
          aria-label="用户状态"
          placeholder="全部状态"
          allowClear
          options={[
            { label: '已启用', value: 'active' },
            { label: '已禁用', value: 'disabled' },
          ]}
          value={filters.status}
          onChange={(status) => updateFilters({ status })}
        />
      </div>
      {(usersQuery.isError || statusMutation.isError) && (
        <Alert
          type="error"
          showIcon
          title={apiErrorMessage(statusMutation.error ?? usersQuery.error)}
        />
      )}
      <Table
        rowKey="id"
        columns={columns}
        dataSource={usersQuery.data?.items ?? []}
        loading={usersQuery.isPending}
        scroll={{ x: 970 }}
        locale={{ emptyText: '没有匹配的用户' }}
        pagination={{
          current: filters.page,
          pageSize: 20,
          total: usersQuery.data?.total,
          showSizeChanger: false,
          onChange: (page) => setFilters((previous) => ({ ...previous, page })),
        }}
      />
      {open && (
        <UserEditorModal
          user={editing}
          currentUserId={currentUser?.id}
          onClose={() => setOpen(false)}
          onSaved={refresh}
        />
      )}
      {resetTarget && (
        <ResetPasswordModal
          user={resetTarget}
          onClose={() => setResetTarget(null)}
        />
      )}
    </div>
  )
}

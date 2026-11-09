import { beforeEach, describe, expect, it } from 'vitest'
import { useWorkspaceStore } from './workspaceStore'

describe('workspaceStore', () => {
  beforeEach(() => useWorkspaceStore.setState({ lastProjectId: null, lastOrgId: null }))

  it('remembers project and its org', () => {
    useWorkspaceStore.getState().rememberProject('p1', 'o1')
    expect(useWorkspaceStore.getState()).toMatchObject({ lastProjectId: 'p1', lastOrgId: 'o1' })
  })

  it('remembers org without touching project', () => {
    useWorkspaceStore.getState().rememberProject('p1', 'o1')
    useWorkspaceStore.getState().rememberOrg('o2')
    expect(useWorkspaceStore.getState()).toMatchObject({ lastProjectId: 'p1', lastOrgId: 'o2' })
  })

  it('forgets a deleted project only if it is the remembered one', () => {
    useWorkspaceStore.getState().rememberProject('p1', 'o1')
    useWorkspaceStore.getState().forgetProject('p2')
    expect(useWorkspaceStore.getState()).toMatchObject({ lastProjectId: 'p1', lastOrgId: 'o1' })
    useWorkspaceStore.getState().forgetProject('p1')
    expect(useWorkspaceStore.getState()).toMatchObject({ lastProjectId: null, lastOrgId: 'o1' })
  })

  it('forgets a deleted org only if it is the remembered one', () => {
    useWorkspaceStore.getState().rememberProject('p1', 'o1')
    useWorkspaceStore.getState().forgetOrg('o2')
    expect(useWorkspaceStore.getState()).toMatchObject({ lastProjectId: 'p1', lastOrgId: 'o1' })
    useWorkspaceStore.getState().forgetOrg('o1')
    expect(useWorkspaceStore.getState()).toMatchObject({ lastProjectId: 'p1', lastOrgId: null })
  })

  it('forgets the remembered project when its org is deleted', () => {
    useWorkspaceStore.getState().rememberProject('p1', 'o1')
    useWorkspaceStore.getState().rememberOrg('o2')
    useWorkspaceStore.getState().forgetOrg('o1', ['p0', 'p1'])
    expect(useWorkspaceStore.getState()).toMatchObject({ lastProjectId: null, lastOrgId: 'o2' })
  })

  it('forgets everything on reset', () => {
    useWorkspaceStore.getState().rememberProject('p1', 'o1')
    useWorkspaceStore.getState().reset()
    expect(useWorkspaceStore.getState()).toMatchObject({ lastProjectId: null, lastOrgId: null })
  })
})

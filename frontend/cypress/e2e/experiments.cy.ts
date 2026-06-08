describe('Experiments (A/B Testing)', () => {
  let authToken: string
  let authUser: any

  before(() => {
    cy.request({
      method: 'POST',
      url: '/api/auth/login',
      body: {
        email: 'demo@togglely.io',
        password: 'demo123!',
      },
    }).then((res) => {
      authToken = res.body.token
      authUser = res.body.user
    })
  })

  const visitWithAuth = (path: string) => {
    cy.visit(path, {
      onBeforeLoad(win) {
        win.localStorage.setItem('token', authToken)
        win.localStorage.setItem(
          'auth-storage',
          JSON.stringify({
            state: { token: authToken, user: authUser },
            version: 0,
          })
        )
      },
    })
  }

  it('should show Experiments link in top navigation', () => {
    visitWithAuth('/dashboard')
    cy.contains('a', 'Experiments').should('be.visible')
  })

  it('should navigate to experiments page', () => {
    visitWithAuth('/dashboard')
    cy.contains('a', 'Experiments').click()
    cy.url().should('include', '/experiments')
    cy.contains(/A\/B Experiments|Experiments/i).should('be.visible')
  })

  it('should display create experiment wizard', () => {
    visitWithAuth('/experiments/new?projectId=test')
    cy.contains('Create Experiment').should('be.visible')
    cy.contains('Basic Information').should('be.visible')
  })

  it('should show wizard form fields', () => {
    visitWithAuth('/experiments/new?projectId=test')
    cy.contains('Experiment Name').should('be.visible')
    cy.contains('Feature Flag').should('be.visible')
    cy.contains('Environment').should('be.visible')
  })
})

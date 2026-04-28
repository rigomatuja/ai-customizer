import { useState } from 'react'
import { Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { useAppState } from './hooks/useAppState'
import { ApplicationGuide } from './pages/ApplicationGuide'
import { Apply } from './pages/Apply'
import { CatalogBrowser } from './pages/CatalogBrowser'
import { CustomDetail } from './pages/CustomDetail'
import { History } from './pages/History'
import { Home } from './pages/Home'
import { Settings } from './pages/Settings'
import { Triggers } from './pages/Triggers'
import { Welcome } from './pages/Welcome'

export function App() {
  const { state, refetch } = useAppState()
  const [catalogEpoch, setCatalogEpoch] = useState(0)

  const handleCatalogRelinked = () => {
    setCatalogEpoch((value) => value + 1)
    refetch()
  }

  if (state.status === 'loading' || state.status === 'idle') {
    return (
      <Layout>
        <main className="page">
          <p className="muted">Loading…</p>
        </main>
      </Layout>
    )
  }

  if (state.status === 'error') {
    return (
      <Layout>
        <main className="page">
          <section className="error-panel">
            <h1>Could not reach the server</h1>
            <p>{state.error.message}</p>
            <button className="button" onClick={refetch}>
              Retry
            </button>
          </section>
        </main>
      </Layout>
    )
  }

  if (!state.data.initialized) {
    return (
      <Layout>
        <Welcome
          catalogPath={state.data.catalogPath}
          userConfigDir={state.data.userConfigDir}
          onInitialized={refetch}
        />
      </Layout>
    )
  }

  return (
    <Layout>
      <Routes key={catalogEpoch}>
        <Route path="/" element={<Home />} />
        <Route path="/catalog" element={<CatalogBrowser />} />
        <Route path="/catalog/:type/:id" element={<CustomDetail />} />
        <Route path="/application-guide" element={<ApplicationGuide />} />
        <Route path="/apply" element={<Apply />} />
        <Route path="/history" element={<History />} />
        <Route path="/triggers" element={<Triggers />} />
        <Route path="/settings" element={<Settings onCatalogRelinked={handleCatalogRelinked} />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Layout>
  )
}

function NotFound() {
  return (
    <main className="page">
      <h1>Not found</h1>
      <p className="muted">That route does not exist.</p>
    </main>
  )
}

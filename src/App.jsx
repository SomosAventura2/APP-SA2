import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import AppLayout from './layout/AppLayout'
import ProtectedRoute from './routes/ProtectedRoute'
import LoginPage from './pages/LoginPage'
import AsistenciaPage from './pages/asistencia/AsistenciaPage'
import GastosPage from './pages/gastos/GastosPage'
import AbonadosPage from './pages/abonados/AbonadosPage'
import HistorialPage from './pages/historial/HistorialPage'
import RankingPage from './pages/ranking/RankingPage'
import ParticipantesPage from './pages/participantes/ParticipantesPage'
import ReservasPage from './pages/reservas/ReservasPage'
import RutasPage from './pages/rutas/RutasPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/rutas" replace />} />
          <Route path="rutas" element={<RutasPage />} />
          <Route path="reservas" element={<ReservasPage />} />
          <Route path="participantes" element={<ParticipantesPage />} />
          <Route path="asistencia" element={<AsistenciaPage />} />
          <Route path="gastos" element={<GastosPage />} />
          <Route path="ranking" element={<RankingPage />} />
          <Route path="abonados" element={<AbonadosPage />} />
          <Route path="historial" element={<HistorialPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/rutas" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

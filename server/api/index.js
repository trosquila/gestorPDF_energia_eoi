import express from 'express'
import cors from 'cors'
import multer from 'multer'
import { config } from '../config.js'
import { facturasRouter } from '../routes/facturas.js'
import { ejemplosRouter } from '../routes/ejemplos.js'
import { analiticaRouter } from '../routes/analitica.js'
import { usuariosRouter } from '../routes/usuarios_historial.js'
import { historialRouter } from '../routes/usuarios_historial.js'

const app = express()

app.use(cors())
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))

app.use('/api/facturas', facturasRouter)
app.use('/api/ejemplos', ejemplosRouter)
app.use('/api/analitica', analiticaRouter)
app.use('/api/usuarios', usuariosRouter)
app.use('/api/historial', historialRouter)

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

app.use((err, req, res, next) => {
  console.error('Error:', err)
  res.status(err.status || 500).json({
    error: err.message || 'Error interno del servidor',
    ...(config.nodeEnv === 'development' && { stack: err.stack })
  })
})

const PORT = config.port
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})

export default app
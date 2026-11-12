import express from 'express'
import cors from 'cors'
import multer from 'multer'
import { config } from '../config.js'
import { facturasRouter } from '../routes/facturas.js'
import { ejemplosRouter } from '../routes/ejemplos.js'
import { analiticaRouter } from '../routes/analitica.js'
import { usuariosRouter } from '../routes/usuarios_historial.js'
import { historialRouter } from '../routes/usuarios_historial.js'
import { clientesRouter } from '../routes/clientes.js'
import { solicitudesRouter } from '../routes/solicitudes.js'
import { comparadorRouter } from '../routes/comparador.js'

const app = express()

app.use(cors())
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))

app.use('/api/facturas', facturasRouter)
app.use('/api/ejemplos', ejemplosRouter)
app.use('/api/analitica', analiticaRouter)
app.use('/api/usuarios', usuariosRouter)
app.use('/api/historial', historialRouter)
app.use('/api/clientes', clientesRouter)
app.use('/api/solicitudes', solicitudesRouter)
app.use('/api/comparador', comparadorRouter)

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

app.use((err, req, res, next) => {
  console.error('Error:', err)

  // Los errores de subida (formato no admitido, archivo demasiado grande)
  // son fallos del cliente: 400, no 500.
  const esErrorDeSubida = err instanceof multer.MulterError ||
    err.name === 'MulterError' ||
    /^Formato no admitido/.test(err.message || '')

  let mensaje = err.message || 'Error interno del servidor'
  if (err.code === 'LIMIT_FILE_SIZE') {
    mensaje = `El archivo supera el tamaño máximo permitido (${config.pdf.maxSize / 1024 / 1024}MB)`
  }

  res.status(err.status || (esErrorDeSubida ? 400 : 500)).json({
    error: mensaje,
    ...(config.nodeEnv === 'development' && !esErrorDeSubida && { stack: err.stack })
  })
})

const PORT = config.port
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})

// Red de seguridad: una librería que lance un error asíncrono (por ejemplo el
// worker de Tesseract con un archivo corrupto) no debe tumbar toda la API.
process.on('uncaughtException', (error) => {
  console.error('Excepción no capturada (el servidor sigue vivo):', error)
})
process.on('unhandledRejection', (motivo) => {
  console.error('Promesa rechazada sin manejar:', motivo)
})

export default app
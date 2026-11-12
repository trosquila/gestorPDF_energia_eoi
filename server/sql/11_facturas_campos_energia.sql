-- Campos de energía que hacen falta para estudios, estadísticas, comparador
-- de ofertas y análisis de sobrecontratación.
-- Basado en el contenido mínimo de factura de la CNMC y en los datos que pide
-- su comparador de ofertas.
--
-- Todo es aditivo: las facturas existentes quedan con NULL y se completan a mano.

ALTER TABLE facturas
  -- Identificación del suministro
  ADD COLUMN IF NOT EXISTS id_contrato          text,
  ADD COLUMN IF NOT EXISTS fecha_fin_contrato   date,
  ADD COLUMN IF NOT EXISTS codigo_postal        text,
  ADD COLUMN IF NOT EXISTS provincia            text,
  ADD COLUMN IF NOT EXISTS tipo_suministro      text,      -- hogar | pyme | industria

  -- Potencia: contratada y máxima demandada, por periodo (P1..P6)
  ADD COLUMN IF NOT EXISTS potencias_contratadas jsonb,    -- {"P1":4.6,"P2":3.45}
  ADD COLUMN IF NOT EXISTS potencias_maximas     jsonb,    -- {"P1":4.10,"P2":3.85}
  ADD COLUMN IF NOT EXISTS precio_potencia       jsonb,    -- {"P1":38.5} €/kW/año

  -- Energía por periodo
  ADD COLUMN IF NOT EXISTS consumos_periodo      jsonb,    -- {"P1":120.3,"P2":98.2}
  ADD COLUMN IF NOT EXISTS precios_periodo       jsonb,    -- {"P1":0.142} €/kWh

  -- Autoconsumo
  ADD COLUMN IF NOT EXISTS autoconsumo           text,     -- sin | excedentes | compensacion_simplificada
  ADD COLUMN IF NOT EXISTS excedentes_kwh        numeric,
  ADD COLUMN IF NOT EXISTS excedentes_eur        numeric,

  -- Desglose económico (auditoría de la factura)
  ADD COLUMN IF NOT EXISTS peajes_cargos_eur      numeric,
  ADD COLUMN IF NOT EXISTS alquiler_contador_eur  numeric,
  ADD COLUMN IF NOT EXISTS impuesto_electrico_eur numeric,
  ADD COLUMN IF NOT EXISTS iva_eur                numeric,
  ADD COLUMN IF NOT EXISTS otros_servicios_eur    numeric,
  ADD COLUMN IF NOT EXISTS bono_social            boolean,

  -- Facturación
  ADD COLUMN IF NOT EXISTS dias_facturados        integer,
  ADD COLUMN IF NOT EXISTS tipo_lectura           text;     -- real | estimada

-- Índices que usará el comparador y la analítica
CREATE INDEX IF NOT EXISTS idx_facturas_provincia ON facturas (provincia);
CREATE INDEX IF NOT EXISTS idx_facturas_peaje     ON facturas (peaje_acceso);
CREATE INDEX IF NOT EXISTS idx_facturas_cliente   ON facturas (id_cliente);

-- Comprobación
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'facturas'
ORDER BY ordinal_position;

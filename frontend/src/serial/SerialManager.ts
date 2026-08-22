import { CONFIG } from '../config'
import type { SerialEvent } from '../types'

type Listener = (event: SerialEvent) => void
export class SerialManager {
  private port: SerialPort|null = null
  private reader: ReadableStreamDefaultReader<Uint8Array>|null = null
  private writer: WritableStreamDefaultWriter<Uint8Array>|null = null
  private listeners = new Set<Listener>()
  private buffer = ''
  private closing = false
  private readGeneration = 0
  onEvent(listener:Listener) { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  isConnected() { return this.port !== null && !this.closing }
  async connect() {
    if (!navigator.serial) throw new Error('Web Serial is unavailable. Use Chrome or Edge on desktop over HTTPS or localhost.')
    if (this.port) return
    this.closing = false
    const port = await navigator.serial.requestPort()
    await port.open({ baudRate: CONFIG.baudRate, bufferSize: 255 })
    if (!port.readable || !port.writable) { await port.close(); throw new Error('The selected serial port did not provide readable and writable streams.') }
    this.port = port
    this.writer = port.writable.getWriter()
    const generation = ++this.readGeneration
    void this.readLoop(port, generation)
  }
  async disconnect() {
    if (!this.port) return
    this.closing = true; ++this.readGeneration
    try { await this.reader?.cancel() } catch { /* already closed */ }
    try { this.reader?.releaseLock() } catch { /* no lock */ }
    this.reader = null
    try { this.writer?.releaseLock() } catch { /* no lock */ }
    this.writer = null
    const port = this.port; this.port = null
    try { await port.close() } finally { this.closing = false; this.buffer = '' }
  }
  async send(command:'PING'|'RESET'|'ARM') {
    if (!this.writer) throw new Error('Arduino is not connected.')
    await this.writer.write(new TextEncoder().encode(`${command}\n`))
    this.emit({ type:'MALFORMED', raw:`> ${command}`, message:'outgoing', receivedAt:performance.now() })
  }
  private async readLoop(port:SerialPort, generation:number) {
    try {
      if (!port.readable) throw new Error('Serial input stream disappeared.')
      this.reader = port.readable.getReader()
      while (!this.closing && generation === this.readGeneration) {
        const { value, done } = await this.reader.read()
        if (done) break
        this.buffer += new TextDecoder().decode(value, { stream:true })
        let newline:number
        while ((newline = this.buffer.indexOf('\n')) >= 0) {
          const line = this.buffer.slice(0,newline).replace(/\r$/, '').trim(); this.buffer = this.buffer.slice(newline+1)
          if (line) this.emit(this.parse(line))
        }
      }
      if (!this.closing) this.emit({ type:'ERROR', raw:'', message:'Serial connection closed unexpectedly.', receivedAt:performance.now() })
    } catch (error) {
      if (!this.closing) this.emit({ type:'ERROR', raw:'', message:error instanceof Error?error.message:String(error), receivedAt:performance.now() })
    } finally { try { this.reader?.releaseLock() } catch { /* no lock */ }; this.reader=null }
  }
  private parse(raw:string):SerialEvent {
    const receivedAt=performance.now(); const [name,value,...rest]=raw.split(',')
    if (name==='PRESS'||name==='RELEASE') { const micros=Number(value); return Number.isInteger(micros)&&micros>=0 ? {type:name,micros,raw,receivedAt} : {type:'MALFORMED',raw,message:'Invalid timestamp',receivedAt} }
    if (name==='READY'||name==='PONG'||name==='ARMED') return {type:name,raw,receivedAt}
    if (name==='ERROR') return {type:'ERROR',raw,message:[value,...rest].filter(Boolean).join(','),receivedAt}
    return {type:'MALFORMED',raw,message:'Unknown message',receivedAt}
  }
  private emit(event:SerialEvent) { this.listeners.forEach(listener=>listener(event)) }
}

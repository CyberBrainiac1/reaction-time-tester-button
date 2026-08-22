interface SerialPort extends EventTarget { readable: ReadableStream<Uint8Array> | null; writable: WritableStream<Uint8Array> | null; open(options: { baudRate: number; bufferSize?: number }): Promise<void>; close(): Promise<void>; }
interface SerialPortRequestOptions { filters?: Array<{ usbVendorId?: number; usbProductId?: number }> }
interface Serial extends EventTarget { requestPort(options?: SerialPortRequestOptions): Promise<SerialPort>; }
interface Navigator { serial?: Serial }


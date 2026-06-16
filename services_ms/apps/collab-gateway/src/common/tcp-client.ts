import * as net from 'net';

export class TcpClient {
  protected static encodeMessage(pattern: string, data: any): Buffer {
    // NestJS microservices packet format
    // 4 bytes: length (big endian)
    // payload: JSON { pattern: string, data: any }
    const payload = JSON.stringify({ pattern, data });
    const buffer = Buffer.alloc(4 + Buffer.byteLength(payload));
    buffer.writeUInt32BE(Buffer.byteLength(payload), 0);
    buffer.write(payload, 4);
    return buffer;
  }

  protected static async send(host: string, port: number, pattern: string, data: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const client = new net.Socket();
      let responseData = '';

      const timeout = setTimeout(() => {
        client.destroy();
        reject(new Error('TCP request timeout'));
      }, 5000);

      client.connect(port, host, () => {
        const message = this.encodeMessage(pattern, data);
        client.write(message);
      });

      client.on('data', (chunk) => {
        responseData += chunk.toString();
      });

      client.on('end', () => {
        clearTimeout(timeout);
        try {
          const response = JSON.parse(responseData);
          resolve(response);
        } catch {
          reject(new Error('Failed to parse TCP response'));
        }
      });

      client.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  }
}

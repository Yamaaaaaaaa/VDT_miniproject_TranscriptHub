import { Controller, All, Req, Res, UseGuards } from '@nestjs/common';
import * as express from 'express';
import * as http from 'http';
import { JwtIdentityGuard } from '../identity/guards/jwt-identity.guard';

@Controller('files')
@UseGuards(JwtIdentityGuard)
export class FilesController {
    private readonly fileServiceUrl = `http://${process.env.FILE_SERVICE_HOST || 'localhost'}:${process.env.FILE_SERVICE_PORT || '3003'}`;

    @All('*')
    proxy(@Req() req: express.Request, @Res() res: express.Response) {
        const targetUrl = `${this.fileServiceUrl}/api/v1/files${req.url}`;
        
        const userId = (req as any).user?.id;
        const headers = { ...req.headers };
        if (userId) {
            headers['x-user-id'] = String(userId);
        }
        
        delete headers['host'];

        const parsedUrl = new URL(targetUrl);
        const options: http.RequestOptions = {
            hostname: parsedUrl.hostname,
            port: parsedUrl.port,
            path: parsedUrl.pathname + parsedUrl.search,
            method: req.method,
            headers: headers,
        };

        const proxyReq = http.request(options, (proxyRes) => {
            res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
            proxyRes.pipe(res);
        });

        proxyReq.on('error', (err) => {
            console.error('Proxy request to File Service failed:', err);
            if (!res.headersSent) {
                res.status(502).send('Bad Gateway');
            }
        });

        req.pipe(proxyReq);
    }
}

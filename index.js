import express from 'express';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import cors from 'cors';

const app = express();
app.use(cors());

const transports = new Map();

const mcpServer = new Server(
  { name: 'delhivery-mock', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

mcpServer.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'geocoding',
      description: 'Delhivery Address Validation',
      inputSchema: { type: 'object', properties: { address_string: { type: 'string' } }, required: ['address_string'] }
    },
    {
      name: 'pickup_request',
      description: 'Delhivery Pickup Creation',
      inputSchema: { type: 'object', properties: { pickup_location: { type: 'string' } }, required: ['pickup_location'] }
    }
  ]
}));

mcpServer.setRequestHandler(CallToolRequestSchema, async (req) => {
  if (req.params.name === 'geocoding') {
    return { content: [{ type: 'text', text: JSON.stringify({ status: 'success', pincode: '560103', serviceable: true }) }] };
  }
  if (req.params.name === 'pickup_request') {
    const loc = req.params.arguments?.pickup_location || '';
    if (loc.includes('Rural') || loc.includes('Village')) {
      return { content: [{ type: 'text', text: JSON.stringify({ status: 'error', error_code: 'PINCODE_UNSERVICEABLE' }) }] };
    }
    return { content: [{ type: 'text', text: JSON.stringify({ status: 'scheduled', pickup_id: 'DEL_PKUP_982312' }) }] };
  }
});

const handleSSE = async (req, res) => {
  const protocol = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.headers['x-forwarded-host'] || req.get('host');
  const publicUrl = `${protocol}://${host}/messages?sessionId=${Date.now()}`;
  
  const transport = new SSEServerTransport(publicUrl, res);
  await mcpServer.connect(transport);
  
  const sessionId = new URL(publicUrl).searchParams.get('sessionId');
  transports.set(sessionId, transport);
  
  res.on('close', () => transports.delete(sessionId));
};

app.get('/', handleSSE);
app.get('/sse', handleSSE);

app.post('/messages', express.json(), async (req, res) => {
  const sessionId = req.query.sessionId;
  const transport = transports.get(sessionId);
  if (!transport) return res.status(404).send('Session not found');
  await transport.handlePostMessage(req, res);
});

const port = process.env.PORT || 3000;
app.listen(port, '0.0.0.0', () => console.log('Live!'));

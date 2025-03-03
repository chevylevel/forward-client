import dotenv from 'dotenv';
import { ServiceClient } from './client/ServiceClient';

dotenv.config();

(async function () {
    const client = new ServiceClient();
    client.init();
    await client.connect();
})();

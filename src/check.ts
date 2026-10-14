import { productionService } from './server.js';
import { safeError } from './errors.js';
try {
  const service = await productionService();
  console.log(JSON.stringify(await service.backend.check(), null, 2));
} catch (e) {
  console.log(JSON.stringify(safeError(e), null, 2));
  process.exitCode = 1;
}

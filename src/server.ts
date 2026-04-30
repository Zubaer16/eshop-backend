import app from './app';
import { envConfig } from './config/env';
import logger from './config/logger';

const PORT = envConfig.PORT;

app.listen(PORT, () => {
  logger.info(`Server running on http://localhost:${PORT}`);
});

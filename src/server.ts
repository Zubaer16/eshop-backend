import app from './app';
import { config } from './config';
import logger from './config/logger';

const PORT = config.env.PORT;

app.listen(PORT, () => {
  logger.info(`Server running on http://localhost:${PORT}`);
});

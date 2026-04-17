import app from './app';
import { config } from './config';

const PORT = config.env.PORT;

// Routes will be mounted here as modules are added

app.listen(PORT, () => {
  console.log(`eshop-backend server is running on port ${PORT}`);
});

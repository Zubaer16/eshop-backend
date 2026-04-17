import app from './app';
import { productController } from './container';
import { config } from './config';

const PORT = config.env.PORT;

// Mount the product routes from the DI container
app.use(config.constants.API_PREFIX, productController.getRouter());

app.listen(PORT, () => {
  console.log(`eshop-backend server is running on port ${PORT}`);
  console.log(`Try visiting: http://localhost:${PORT}${config.constants.API_PREFIX}/products`);
});

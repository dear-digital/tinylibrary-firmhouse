import express from 'express';
import dotenv from 'dotenv';
import { Shopify } from '@shopify/shopify-api';
import bodyParser from 'body-parser';
import cors from 'cors';
import crypto from 'crypto';
import axios from 'axios';

dotenv.config();

const host = 'localhost';
const port = process.env.PORT || 9000;

const {
  SHOPIFY_API_KEY,
  SHOPIFY_API_SECRET,
  SHOPIFY_API_SCOPES,
  HOST,
  X_PROJECT_ACCESS_TOKEN,
  X_SHOPIFY_ACCESS_TOKEN,
} = process.env;

const shops = {};

Shopify.Context.initialize({
  API_KEY: SHOPIFY_API_KEY,
  API_SECRET_KEY: SHOPIFY_API_SECRET,
  SCOPES: SHOPIFY_API_SCOPES,
  HOST_NAME: HOST.replace(/https:\/\//, ''),
  IS_EMBEDDED_APP: true,
});

const app = express();

var urlencodedParser = bodyParser.urlencoded({ extended: false });

app.use(cors());

app.get('/', async (req, res) => {
  //res.send('Hello World !');
  if (typeof shops[req.query.shop] !== 'undefined') {
    // const sessionToken = await getSessionToken(bridgeApp);
    // console.log(sessionToken);
    res.send('Hello World');
  } else {
    res.redirect(`/auth?shop=${req.query.shop}`);
  }
});

app.get('/auth', async (req, res) => {
  const authRoute = await Shopify.Auth.beginAuth(
    req,
    res,
    req.query.shop,
    '/auth/callback',
    false
  );
  res.redirect(authRoute);
});

app.get('/auth/callback', async (req, res) => {
  const shopSession = await Shopify.Auth.validateAuthCallback(
    req,
    res,
    req.query
  );
  console.log(shopSession);
  shops[shopSession.shop] = shopSession;
  res.redirect(`/?shop=${shopSession.shop}&host=${req.query.host}`);
  // res.redirect(
  //   `https://${shopSession.shop}/admin/apps/custom-subscriptions-manager`
  // );
});

// Verify that the request is coming from an authentic source
async function verifyRequest(req, res, next) {
  console.log(req.query);

  // DESTRUCTURE signature and rest of query object
  const { signature, ...restQueryString } = req.query;

  if (signature && restQueryString) {
    // console.log(signature, restQueryString);

    // Prepare the query string for hashing by
    // sorting and concatenating into a string
    const sortedParams = Object.keys(restQueryString)
      .sort()
      .reduce((accumulator, key) => {
        accumulator += key + '=' + restQueryString[key];

        return accumulator;
      }, '');
    // console.log(sortedParams);

    // Calculate the hex digest of sortedParams
    const calculatedSignature = calculateHexDigest(sortedParams);

    // console.log(calculatedSignature);
    // console.log(signature);

    // Check if both signatures are same. If yes,
    // goto next step. If no, return 400 status error
    if (calculatedSignature === signature) {
      next();
      /*const { logged_in_customer_id, ...rest } = restQueryString;
      if (req.body.customer_id) {
        if (req.body.customer_id === logged_in_customer_id) {
          console.log('Customer id matched');
          next();
        } else {
          console.log('Unauthenticated request. Customer ID mismatch');
          res.status(400).send(`Unauthenticated Request`);
        }
      } else {
        console.log(
          'Unauthenticated request. No customer id found in request.'
        );
        res.status(400).send(`Unauthenticated Request`);
      }*/
    } else {
      console.log('Unauthenticated request');
      res.status(400).send(`Unauthenticated Request`);
    }
  } else {
    console.log('Unauthenticated request');
    res.status(400).send(`Unauthenticated Request`);
  }
}

// Get all subscriptions for an email
app.post(
  '/subscriptions',
  urlencodedParser,
  verifyRequest,
  async (req, res) => {
    try {
      //console.log(req.body.customer_id);
      const email = await getCustomerEmail(req.body.customer_id);
      //console.log(email);
      const query = `query {
		subscriptions(email:"${email}",statuses:[ACTIVATED,PAUSED,CANCELLED]){
        nodes{
            id
            token
            orders{
              id
              status
              shipmentDate
              amountCents
              invoice{
                detailsUrl
              }
            } 
        }
      }
    }`;
      //console.log(query);

      const response = await axios({
        method: 'post',
        url: 'https://portal.firmhouse.com/graphql',
        headers: {
          'X-PROJECT-ACCESS-TOKEN': X_PROJECT_ACCESS_TOKEN,
        },
        data: {
          query: query,
        },
      });

      // console.log(response.data.data.subscriptions.nodes);
      res.json(response.data);
    } catch (error) {
      console.log(error);
      res.status(500).send('Oops ! Some error occurred');
    }
  }
);

// getSubscription API call
app.post(
  '/subscriptions/getSubscription',
  urlencodedParser,
  verifyRequest,
  async (req, res) => {
    try {
      const query = `query{
        getSubscription(token:"${req.body.token}"){
        id
        name
        email
        fullAddress
        city
        zipcode
        country
        paymentMethod 
        orderedProducts{
           id
           shipmentDate
           quantity
           product{
            id
            title
            priceWithSymbol
            imageUrl
            interval
            intervalUnitOfMeasure
           }
           interval
           intervalUnitOfMeasure
         }
         orders{
          id
          amountCents
          shippingCostsCents
         }
       }
     }`;
      //console.log(query);

      const response = await axios({
        method: 'post',
        url: 'https://portal.firmhouse.com/graphql',
        headers: {
          'X-PROJECT-ACCESS-TOKEN': X_PROJECT_ACCESS_TOKEN,
        },
        data: {
          query: query,
        },
      });

      // console.log(response.data.data.subscriptions.nodes);
      res.json(response.data);
    } catch (error) {
      console.log(error);
      res.status(500).send('Oops ! Some error occurred');
    }
  }
);

// Set Next Shipment API call
app.post(
  '/subscriptions/setNextShipmentDate',
  urlencodedParser,
  verifyRequest,
  async (req, res) => {
    try {
      const query = `mutation{
        updateOrderedProduct(input:{
          id:"${req.body.orderedProductId}"
          shipmentDate:"${req.body.nextShipmentDate}"
        }){
          orderedProduct{
            id
            shipmentDate
            quantity
            product{
             id
             title
             priceWithSymbol
             imageUrl
             interval
             intervalUnitOfMeasure
            }
            interval
            intervalUnitOfMeasure
          }
        }
      }`;
      //console.log(query);

      const response = await axios({
        method: 'post',
        url: 'https://portal.firmhouse.com/graphql',
        headers: {
          'X-PROJECT-ACCESS-TOKEN': X_PROJECT_ACCESS_TOKEN,
          'X-SUBSCRIPTION-TOKEN': req.body.subscriptionToken,
        },
        data: {
          query: query,
        },
      });

      // console.log(response.data.data.subscriptions.nodes);
      res.json(response.data);
    } catch (error) {
      console.log(error);
      res.status(500).send('Oops ! Some error occurred');
    }
  }
);

// Update Order Schedule API call
app.post(
  '/subscriptions/updateOrderSchedule',
  urlencodedParser,
  verifyRequest,
  async (req, res) => {
    try {
      const query = `mutation{
        updateOrderedProduct(input:{
          id:"${req.body.orderedProductId}",
          interval:${req.body.interval},
          intervalUnitOfMeasure:"${req.body.intervalUnitOfMeasure}"
        }){
          orderedProduct{
            id
            shipmentDate
            quantity
            product{
             id
             title
             priceWithSymbol
             imageUrl
             interval
             intervalUnitOfMeasure
            }
            interval
            intervalUnitOfMeasure
          }
        }
      }`;
      //console.log(query);

      const response = await axios({
        method: 'post',
        url: 'https://portal.firmhouse.com/graphql',
        headers: {
          'X-PROJECT-ACCESS-TOKEN': X_PROJECT_ACCESS_TOKEN,
          'X-SUBSCRIPTION-TOKEN': req.body.subscriptionToken,
        },
        data: {
          query: query,
        },
      });

      // console.log(response.data.data.subscriptions.nodes);
      res.json(response.data);
    } catch (error) {
      console.log(error);
      res.status(500).send('Oops ! Some error occurred');
    }
  }
);

// Update Quantity API call
app.post(
  '/subscriptions/updateQuantity',
  urlencodedParser,
  verifyRequest,
  async (req, res) => {
    try {
      const query = `mutation{
        updateOrderedProduct(input:{
          id:"${req.body.orderedProductId}"
          quantity:${req.body.quantity}
        }){
          orderedProduct{
            id
            shipmentDate
            quantity
            product{
             id
             title
             priceWithSymbol
             imageUrl
             interval
             intervalUnitOfMeasure
            }
            interval
            intervalUnitOfMeasure
          }
        }
      }`;
      //console.log(query);

      const response = await axios({
        method: 'post',
        url: 'https://portal.firmhouse.com/graphql',
        headers: {
          'X-PROJECT-ACCESS-TOKEN': X_PROJECT_ACCESS_TOKEN,
          'X-SUBSCRIPTION-TOKEN': req.body.subscriptionToken,
        },
        data: {
          query: query,
        },
      });

      // console.log(response.data.data.subscriptions.nodes);
      res.json(response.data);
    } catch (error) {
      console.log(error);
      res.status(500).send('Oops ! Some error occurred');
    }
  }
);

// Swap Product API call
app.post(
  '/subscriptions/swapOrderedProduct',
  urlencodedParser,
  verifyRequest,
  async (req, res) => {
    try {
      const query = `mutation{
        updateOrderedProduct(input:{
          id:"${req.body.orderedProductId}"
          quantity:${req.body.quantity}
          productId:"${req.body.productId}"
        }){
          orderedProduct{
            id
            shipmentDate
            quantity
            product{
             id
             title
             priceWithSymbol
             imageUrl
             interval
             intervalUnitOfMeasure
            }
            interval
            intervalUnitOfMeasure
          }
        }
      }`;
      //console.log(query);

      const response = await axios({
        method: 'post',
        url: 'https://portal.firmhouse.com/graphql',
        headers: {
          'X-PROJECT-ACCESS-TOKEN': X_PROJECT_ACCESS_TOKEN,
          'X-SUBSCRIPTION-TOKEN': req.body.subscriptionToken,
        },
        data: {
          query: query,
        },
      });

      // console.log(response.data.data.subscriptions.nodes);
      res.json(response.data);
    } catch (error) {
      console.log(error);
      res.status(500).send('Oops ! Some error occurred');
    }
  }
);

// Add/Create Product API call
app.post(
  '/subscriptions/createOrderedProduct',
  urlencodedParser,
  verifyRequest,
  async (req, res) => {
    try {
      const query = ` mutation{
        createOrderedProduct(input:{
          orderedProduct:{
          productId:${req.body.productId}
          quantity:${req.body.quantity}
          }
        }){
          orderedProduct{
            id
            shipmentDate
            product{
              id
              title
              priceWithSymbol
              interval
              intervalUnitOfMeasure
            }
            interval
            intervalUnitOfMeasure
          }
        }
      }`;
      console.log(query);

      const response = await axios({
        method: 'post',
        url: 'https://portal.firmhouse.com/graphql',
        headers: {
          'X-PROJECT-ACCESS-TOKEN': X_PROJECT_ACCESS_TOKEN,
          'X-SUBSCRIPTION-TOKEN': req.body.subscriptionToken,
        },
        data: {
          query: query,
        },
      });

      // console.log(response.data.data.subscriptions.nodes);
      res.json(response.data);
    } catch (error) {
      console.log(error);
      res.status(500).send('Oops ! Some error occurred');
    }
  }
);

// Skip Shipment API call
app.post(
  '/subscriptions/skipShipment',
  urlencodedParser,
  verifyRequest,
  async (req, res) => {
    try {
      const query = ` mutation{
        updateOrderedProduct(input:{
          id:"${req.body.orderedProductId}"
          shipmentDate:"${req.body.nextShipmentDate}"
        }){
          orderedProduct{
            id
            shipmentDate
            quantity
            product{
             id
             title
             priceWithSymbol
             imageUrl
             interval
             intervalUnitOfMeasure
            }
            interval
            intervalUnitOfMeasure
          }
        }
      }`;
      //console.log(query);

      const response = await axios({
        method: 'post',
        url: 'https://portal.firmhouse.com/graphql',
        headers: {
          'X-PROJECT-ACCESS-TOKEN': X_PROJECT_ACCESS_TOKEN,
          'X-SUBSCRIPTION-TOKEN': req.body.subscriptionToken,
        },
        data: {
          query: query,
        },
      });

      // console.log(response.data.data.subscriptions.nodes);
      res.json(response.data);
    } catch (error) {
      console.log(error);
      res.status(500).send('Oops ! Some error occurred');
    }
  }
);

// Cancel Subscription API call
app.post(
  '/subscriptions/cancelSubscription',
  urlencodedParser,
  verifyRequest,
  async (req, res) => {
    try {
      const query = ` mutation{
        destroyOrderedProduct(input:{
          id:"${req.body.orderedProductId}"
        }){
          orderedProduct{
            id
            quantity
            shipmentDate
            product{
              id
              title
              priceWithSymbol
              interval
              intervalUnitOfMeasure
            }
            interval
            intervalUnitOfMeasure
          }
        }
      }`;
      //console.log(query);

      const response = await axios({
        method: 'post',
        url: 'https://portal.firmhouse.com/graphql',
        headers: {
          'X-PROJECT-ACCESS-TOKEN': X_PROJECT_ACCESS_TOKEN,
        },
        data: {
          query: query,
        },
      });

      // console.log(response.data.data.subscriptions.nodes);
      res.json(response.data);
    } catch (error) {
      console.log(error);
      res.status(500).send('Oops ! Some error occurred');
    }
  }
);

// Apply Discount Code API call
app.post(
  '/subscriptions/applyDiscountCode',
  urlencodedParser,
  verifyRequest,
  async (req, res) => {
    try {
      let query = `
      query{
        getDiscountCode(code:"${req.body.discountCode}"){
          promotionId
          expired
        }
      }
      `;
      //console.log(query);

      let response = await axios({
        method: 'post',
        url: 'https://portal.firmhouse.com/graphql',
        headers: {
          'X-PROJECT-ACCESS-TOKEN': X_PROJECT_ACCESS_TOKEN,
        },
        data: {
          query: query,
        },
      });
      const { promotionId, expired } = response.data.data.getDiscountCode;
      //console.log(promotionId, expired);
      if (!expired) {
        query = `
          mutation{
            applyPromotionToSubscription(input:{
              promotionId : "${promotionId}"
              subscriptionId: "${req.body.subscriptionId}"
            }){
              appliedPromotion{
                id
                active
              }
              errors{
                message
              }
            }
          }      
        `;
        //console.log(query);
        response = await axios({
          method: 'post',
          url: 'https://portal.firmhouse.com/graphql',
          headers: {
            'X-PROJECT-ACCESS-TOKEN': X_PROJECT_ACCESS_TOKEN,
          },
          data: {
            query: query,
          },
        });
        //console.log(response.data.data);
        if (
          response.data.data.applyPromotionToSubscription.errors.length == 0
        ) {
          res.send('Discount code applied successfully.');
        } else {
          res.send('Invalid  or used discount');
        }
      } else {
        res.send('Discount code expired');
      }
    } catch (error) {
      //console.log(error);
      res.send('Invalid  or used discount');
    }
  }
);

// Update Added Product API call
app.post(
  '/subscriptions/updateAddedProduct',
  urlencodedParser,
  verifyRequest,
  async (req, res) => {
    try {
      const query = ` mutation{
        updateOrderedProduct(input:{
          id:"${req.body.orderedProductId}"
          shipmentDate:"${req.body.nextShipmentDate}"
          interval:${req.body.interval}
          intervalUnitOfMeasure:"${req.body.intervalUnitOfMeasure}"
        }){
          orderedProduct{
            id
            shipmentDate
            quantity
            product{
             id
             title
             priceWithSymbol
             imageUrl
             interval
             intervalUnitOfMeasure
            }
            interval
            intervalUnitOfMeasure
          }
        }
      }`;
      //console.log(query);

      const response = await axios({
        method: 'post',
        url: 'https://portal.firmhouse.com/graphql',
        headers: {
          'X-PROJECT-ACCESS-TOKEN': X_PROJECT_ACCESS_TOKEN,
          'X-SUBSCRIPTION-TOKEN': req.body.subscriptionToken,
        },
        data: {
          query: query,
        },
      });

      // console.log(response.data.data.subscriptions.nodes);
      res.json(response.data);
    } catch (error) {
      console.log(error);
      res.status(500).send('Oops ! Some error occurred');
    }
  }
);

// Create subscription API call
app.post(
  '/subscriptions/createSubscription',
  urlencodedParser,
  verifyRequest,
  async (req, res) => {
    try {
      var items = JSON.parse(req.body.items);

      var orderedProductsString = '';
      items.map(product => {
        orderedProductsString += `{
        productId : "${product.firmhouseid}",
        quantity : ${product.quantity},
        customPriceCents : ${product.final_price},
    }`;
      });

      // Run the create subscription query
      let query = `
            mutation {
            createSubscription(input: {
            name: "${req.body.name}", 
            address: "${req.body.address}", 
            houseNumber: "${req.body.houseNumber}", 
            zipcode: "${req.body.zipcode}", 
            city: "${req.body.city}", 
            country: "${req.body.country}",
            email: "${req.body.email}", 
            phoneNumber: "${req.body.phoneNumber}",
            returnUrl: "https://brauzz-de.myshopify.com/pages/order-confirmation", 
            paymentPageUrl: "http://example.com/cart", 
            orderedProducts: [${orderedProductsString}]
            }) {
            paymentUrl
            subscription{
              id
              token
              paymentMethod
              orderedProducts{
                id
                productId
                interval
                intervalUnitOfMeasure
              }
            }
            errors {
              attribute
              message
              path
            }
          }
        }`;
      console.log(query);

      let response = await axios({
        method: 'post',
        url: 'https://portal.firmhouse.com/graphql',
        headers: {
          'X-PROJECT-ACCESS-TOKEN': X_PROJECT_ACCESS_TOKEN,
        },
        data: {
          query: query,
        },
      });

      res.json(response.data);
    } catch (error) {
      console.log(error);
      res.status(500).send('Oops ! Some error occurred');
    }
  }
);

// Get all products API call
app.post(
  '/subscriptions/getAllProducts',
  urlencodedParser,
  verifyRequest,
  async (req, res) => {
    try {
      const query = `
      query{
        products{
          nodes{
            id
            title
            imageUrl
            interval
            intervalUnitOfMeasure
            priceWithSymbol
            productType
          }
        }
      }
    `;
      //console.log(query);

      const response = await axios({
        method: 'post',
        url: 'https://portal.firmhouse.com/graphql',
        headers: {
          'X-PROJECT-ACCESS-TOKEN': X_PROJECT_ACCESS_TOKEN,
        },
        data: {
          query: query,
        },
      });

      // console.log(response.data.data.subscriptions.nodes);
      res.json(response.data);
    } catch (error) {
      console.log(error);
      res.status(500).send('Oops ! Some error occurred');
    }
  }
);

// Create cart API call
app.post(
  '/subscriptions/createCart',
  urlencodedParser,
  verifyRequest,
  async (req, res) => {
    try {
      const query = `
      mutation{
              createCart(input:{}){
                cart{
                  token
                }
                subscription{
                  id
                  checkoutUrl
                }
              }
            }
    `;
      //console.log(query);

      const response = await axios({
        method: 'post',
        url: 'https://portal.firmhouse.com/graphql',
        headers: {
          'X-PROJECT-ACCESS-TOKEN': X_PROJECT_ACCESS_TOKEN,
        },
        data: {
          query: query,
        },
      });

      // console.log(response.data.data.subscriptions.nodes);
      res.json(response.data);
    } catch (error) {
      console.log(error);
      res.status(500).send('Oops ! Some error occurred');
    }
  }
);

// Add product to cart API call
app.post(
  '/subscriptions/addToCart',
  urlencodedParser,
  verifyRequest,
  async (req, res) => {
    try {
      const query = `
      mutation{
                      createOrderedProduct(input : {
                        orderedProduct : {
                        productId : ${req.body.productId}
                        quantity : ${req.body.quantity}
                        }
                        subscriptionId : ${req.body.subscriptionId}
                      }){
                        orderedProduct{
                          productId
                          quantity
                        }
                        subscription{
                          id
                        }
                      }
                    }
    `;
      //console.log(query);

      const response = await axios({
        method: 'post',
        url: 'https://portal.firmhouse.com/graphql',
        headers: {
          'X-PROJECT-ACCESS-TOKEN': X_PROJECT_ACCESS_TOKEN,
        },
        data: {
          query: query,
        },
      });

      // console.log(response.data.data.subscriptions.nodes);
      res.json(response.data);
    } catch (error) {
      console.log(error);
      res.status(500).send('Oops ! Some error occurred');
    }
  }
);

// Function to calculate HEX Digest
function calculateHexDigest(query) {
  var hmac = crypto.createHmac('sha256', SHOPIFY_API_SECRET);

  //passing the data to be hashed
  const data = hmac.update(query);

  //Creating the hmac in the required format
  const gen_hmac = data.digest('hex');

  //Printing the output on the console
  // console.log('hmac : ' + gen_hmac);
  return gen_hmac;
}

// Get the customer email
async function getCustomerEmail(customer_id) {
  const gid = 'gid://shopify/Customer/' + customer_id;

  // Query to retrieve customer email from customer id
  const query = `query{
        customer(id:"${gid}"){
        email
      }
    }`;
  //console.log(query);

  try {
    const response = await axios({
      method: 'post',
      url: 'https://brauzz-de.myshopify.com/admin/api/graphql.json',
      headers: {
        'X-Shopify-Access-Token': X_SHOPIFY_ACCESS_TOKEN,
      },
      data: {
        query: query,
      },
    });

    //console.log(response.data);
    return response.data.data.customer.email;
  } catch (error) {
    console.log(error);
  }
}

// Test Route
app.get('/test', (req, res) => {
  res.send('Test Successfull');
});

app.listen(port, () => {
  console.log('App is running on port ' + port);
});

const xmlrpc = require("xmlrpc");
require("dotenv").config();
const axios = require("axios");
const xml2js = require("xml2js");
const parser = new xml2js.Parser();

// Odoo connection details
const url = process.env.url;
const db = process.env.db;
const username = process.env.user;
const password = process.env.password;
const crColonCurrencyId = 15;

// Create a new Date object
const today = new Date();

// Get the day, month, and year
const day = String(today.getDate()).padStart(2, "0");
const month = String(today.getMonth() + 1).padStart(2, "0"); // Months are 0-based
const year = today.getFullYear();

// Format the date as dd/mm/yyyy
const formattedDate = `${day}/${month}/${year}`;
const odoodDate = `${year}-${month}-${day}`;

// SOAP request for exchange rates (compra or venta)
const soapRequest = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <ObtenerIndicadoresEconomicosXML xmlns="http://ws.sdde.bccr.fi.cr">
      <Indicador>318</Indicador> <!-- For "compra" exchange rate (317) or "venta" (318) -->
      <FechaInicio>${formattedDate}</FechaInicio> 
      <FechaFinal>${formattedDate}</FechaFinal> <!-- Replace with actual end date -->
      <Nombre>your_name</Nombre> pepe
      <SubNiveles>N</SubNiveles> N
      <CorreoElectronico>patapufete65@gmail.com</CorreoElectronico> <!-- Replace with your email -->
      <Token>9GLELLOR0A</Token>
    </ObtenerIndicadoresEconomicosXML>
  </soap:Body>
</soap:Envelope>`;

const headers = {
  "Content-Type": "text/xml; charset=utf-8",
  "Content-Length": soapRequest.length,
  SOAPAction: "http://ws.sdde.bccr.fi.cr/ObtenerIndicadoresEconomicosXML",
};

const bankUrl =
  "https://gee.bccr.fi.cr/Indicadores/Suscripciones/WS/wsindicadoreseconomicos.asmx";

async function exchangeCRCtoday() {
  try {
    const response = await axios.post(bankUrl, soapRequest, { headers });

    let todaysRate = await parseXMLResponse(response.data);

    return todaysRate;
  } catch (error) {
    console.error("Error fetching exchange rates:", error);
  }
}

async function parseXMLResponse(xml) {
  try {
    const result = await parser.parseStringPromise(xml);

    // Extract the embedded XML string from the SOAP response
    const rawXmlData =
      result["soap:Envelope"]["soap:Body"][0][
        "ObtenerIndicadoresEconomicosXMLResponse"
      ][0]["ObtenerIndicadoresEconomicosXMLResult"][0];

    // Parse the embedded XML data to an object
    const embeddedXml = await parser.parseStringPromise(rawXmlData);

    const economicData =
      embeddedXml.Datos_de_INGC011_CAT_INDICADORECONOMIC
        .INGC011_CAT_INDICADORECONOMIC;

    // Iterate over the parsed economic data and log the date and rate
    economicData.forEach((item) => {
      const date = item.DES_FECHA[0];
      todaysRate = 1 / item.NUM_VALOR[0];
    });
    return todaysRate;
  } catch (err) {
    console.error("Error parsing XML:", err);
  }
}
////////////////////////////////////////////////////////////////////
// XML-RPC clients
const commonClient = xmlrpc.createClient({ url: `${url}/common` });
const objectClient = xmlrpc.createClient({ url: `${url}/object` });

// Authenticate with Odoo
const authenticate = async () => {
  return new Promise((resolve, reject) => {
    commonClient.methodCall(
      "authenticate",
      [db, username, password, {}],
      (error, uid) => {
        if (error) {
          reject(error);
        } else {
          resolve(uid);
        }
      }
    );
  });
};

// Check access rights for 'res.partner'
const checkAccessRights = async (uid) => {
  return new Promise((resolve, reject) => {
    objectClient.methodCall(
      "execute_kw",
      [
        db,
        uid,
        password,
        "res.partner",
        "check_access_rights",
        ["read"],
        { raise_exception: false },
      ],
      (error, result) => {
        if (error) {
          reject(error);
        } else {
          resolve(result);
        }
      }
    );
  });
};

// Search for currency by ID
/* const searchCurrency = async (uid, currencyId) => {
  return new Promise((resolve, reject) => {
    objectClient.methodCall(
      "execute_kw",
      [
        db,
        uid,
        password,
        "res.currency",
        "search",
        [[["id", "=", currencyId]]],
      ],
      (error, result) => {
        if (error) {
          reject(error);
        } else {
          resolve(result);
        }
      }
    );
  });
}; */

// Create a new exchange rate for a currency
const createRate = async (uid, currencyId) => {
  let rate = await exchangeCRCtoday();

  return new Promise((resolve, reject) => {
    objectClient.methodCall(
      "execute_kw",
      [
        db,
        uid,
        password,
        "res.currency.rate",
        "create",
        [{ name: odoodDate, rate: rate, currency_id: currencyId }],
      ],
      (error, result) => {
        if (error) {
          reject(error);
        } else {
          resolve(result);
        }
      }
    );
  });
};

// Read the updated exchange rates for a currency
const readRates = async (uid, currencyId) => {
  return new Promise((resolve, reject) => {
    objectClient.methodCall(
      "execute_kw",
      [
        db,
        uid,
        password,
        "res.currency.rate",
        "search_read",
        [[["currency_id", "=", currencyId]], ["name", "rate"]],
      ],
      (error, result) => {
        if (error) {
          reject(error);
        } else {
          resolve(result);
        }
      }
    );
  });
};

// Main function to execute the operations
const main = async (date, rate) => {
  try {
    const uid = await authenticate();

    const accessRights = await checkAccessRights(uid);

    const newRateCrc = await createRate(uid, crColonCurrencyId, rate, date);

    const updatedRatesCrc = await readRates(uid, crColonCurrencyId);
    console.log(
      "Authenticated user ID:",
      uid,
      "\nAccess Rights for res.partner:",
      accessRights,
      "\nNew CRC rate created with ID:",
      newRateCrc
    );
  } catch (error) {
    console.error("Error:", error);
  }
};

// Run the main function
main();


/**
 * Note: In a production Firebase project, this file would be in functions/src/index.ts
 * and deployed using the Firebase CLI.
 */

// import * as functions from 'firebase-functions';
// import * as admin from 'firebase-admin';

// Pricing logic duplicated here for server-side enforcement
const calculatePriceServer = (tipoPedido: string, puntoVenta: string | undefined, total: number) => {
  if (puntoVenta === 'Karen Donas') return total * 15;
  if (tipoPedido === 'Punto de venta') return total * 20;
  
  const tiers: Record<number, number> = { 6: 160, 7: 190, 8: 220, 9: 250, 10: 280, 11: 310 };
  return tiers[total] || (total * 25);
};

/**
 * Example Callable Function for Order Creation
 */
/*
export const submitOrder = functions.https.onCall(async (data, context) => {
  const { tipoPedido, quantities, fechaEntrega, email, nombre } = data;
  
  // 1. Validation
  const total = Object.values(quantities).reduce((a: any, b: any) => a + b, 0);
  if (total < 6) throw new functions.https.HttpsError('invalid-argument', 'Min 6 donuts');
  
  const date = new Date(fechaEntrega);
  if (date.getDay() === 0) throw new functions.https.HttpsError('invalid-argument', 'No Sundays');
  
  // 2. Pricing
  const price = calculatePriceServer(tipoPedido, data.puntoVenta, total);
  
  // 3. Save to Firestore
  const orderRef = await admin.firestore().collection('orders').add({
    ...data,
    totalDonas: total,
    precioTotal: price,
    statusPagado: 'No pagado',
    statusOrder: 'Recibido',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  
  // 4. Send Confirmation Email (Stubs for SendGrid)
  console.log(`Email confirmation sent to ${email} for order ${orderRef.id}`);
  
  return { id: orderRef.id, price };
});
*/

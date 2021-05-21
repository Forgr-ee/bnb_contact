import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import {
  uniqueNamesGenerator,
  adjectives,
  colors,
  animals,
} from "unique-names-generator";
import Stripe from "stripe";
import dayjs from "dayjs";
admin.initializeApp();
const configSecret = functions.config();
const stripe = new Stripe(configSecret.stripe.apikey, {
  apiVersion: "2020-08-27",
});

/* eslint max-len: ["error", { "ignoreTemplateLiterals": true }]*/
/* eslint camelcase: [1]*/

export const getBnbCode = functions.https.onRequest(async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET,HEAD,OPTIONS,POST,PUT");
  // eslint-disable-next-line max-len
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization, x-bnb-apikey");
  if (req.get("x-bnb-apikey") !== configSecret.bnb.apikey || (
    !req.body.firstname || !req.body.email
  )) {
    console.error({body: req.body, error: "UnAuthorise",
      key: req.get("x-bnb-apikey")});
    res.json({error: "UnAuthorise"});
    return;
  }
  try {
    const pastDate = dayjs().subtract(10, "minute");
    let bnbcode = uniqueNamesGenerator({
      dictionaries: [adjectives, colors, animals],
    });
    const docRef = await admin.firestore()
        .collection("users")
        .doc(req.body.email);
    const user: any = await docRef.get();
    if (user.exists && pastDate.isAfter(user.codeUpdatedAt)) {
      await docRef.update({
        oldBnbcodes: admin.firestore.FieldValue.arrayUnion(user.bnbcode),
      });
      if (!("sender" in user.roles)) {
        await docRef.update({
          roles: admin.firestore.FieldValue.arrayUnion("sender"),
        });
      }
      await docRef.set({
        bnbcode,
        codeUpdatedAt: dayjs().toISOString(),
        updatedAt: dayjs().toISOString(),
      });
    } else if (user.exists && pastDate.isBefore(user.codeUpdatedAt)) {
      bnbcode = user.bnbcode;
      if (!("sender" in user.roles)) {
        await docRef.update({
          roles: admin.firestore.FieldValue.arrayUnion("sender"),
          updatedAt: dayjs().toISOString(),
        });
      }
      await admin
          .firestore()
          .collection("mail")
          .add({
            to: req.body.email,
            message: {
              subject: "Bnb.contact Tips",
              text: `Hello ${req.body.firstname}, \n Your code ${bnbcode} is still valable ${dayjs(user.codeUpdatedAt).diff(pastDate, "minute")} minutes, if you want to keep it, click here : https://bnb.contact/keep/${bnbcode}`,
              html: `Hello ${req.body.firstname}, <br/> Your code ${bnbcode} is still valable ${dayjs(user.codeUpdatedAt).diff(pastDate, "minute")} minutes, if you want to keep it, click here : <a href="https://bnb.contact/keep/${bnbcode}"https://bnb.contact/keep/${bnbcode}</a>`,
            },
          })
          .then(() => console.log("Queued email for delivery!"));
      res.json({bnbcode});
      return;
    } else {
      await docRef.set({...req.body,
        bnbcode: bnbcode,
        oldBnbcodes: [],
        usedBnbcodes: [],
        premium: false,
        roles: ["sender"],
        createdAt: dayjs().toISOString(),
        updatedAt: dayjs().toISOString(),
        codeUpdatedAt: dayjs().toISOString(),
      });
    }
    await admin
        .firestore()
        .collection("mail")
        .add({
          to: req.body.email,
          message: {
            subject: "Bnb.contact Tips",
            text: `Hello ${req.body.firstname}, \n Your code ${bnbcode} will be valable ${dayjs(user.codeUpdatedAt).diff(pastDate, "minute")} minutes, if you want to keep it, click here : https://bnb.contact/keep/${bnbcode}`,
            html: `Hello ${req.body.firstname}, <br/> Your code ${bnbcode} will be valable ${dayjs(user.codeUpdatedAt).diff(pastDate, "minute")} minutes, if you want to keep it, click here : <a href="https://bnb.contact/keep/${bnbcode}"https://bnb.contact/keep/${bnbcode}</a>`,
          },
        })
        .then(() => console.log("Queued email for delivery!"));
    res.json({bnbcode});
    return;
  } catch (err) {
    console.error("err", err);
    res.json({error: err});
    return;
  }
});

export const getBnbContact = functions.https.onRequest(async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET,HEAD,OPTIONS,POST,PUT");
  // eslint-disable-next-line max-len
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization, x-bnb-apikey");
  if (req.get("x-bnb-apikey") !== configSecret.bnb.apikey || (
    !req.body.bnbcode || !req.body.firstname || !req.body.email
  )) {
    console.error({body: req.body, error: "UnAuthorise",
      key: req.get("x-bnb-apikey")});
    res.json({status: "ko", error: "UnAuthorise"});
    return;
  }
  try {
    let contact: any = null;
    const usersRef = admin.firestore().collection("users");
    const snapshot = await usersRef.where("bnbcode", "==", req.body.bnbcode)
        .get();
    if (!snapshot.empty) {
      snapshot.forEach((doc) => {
        contact = doc.data();
      });
    } else {
      const oldCodes = await usersRef.where("oldBnbcode", "array-contains",
          "west_coast").get();
      if (!oldCodes.empty) {
        snapshot.forEach((doc) => {
          contact = doc.data();
          contact.foundOld = true;
        });
      }
    }
    if (!contact) {
      res.json({status: "ko", error: "Not found"});
      return;
    }
    const docRef = await admin.firestore()
        .collection("users")
        .doc(req.body.email);
    const user: any = await docRef.get();
    if (!user.exists) {
      await docRef.set({...req.body,
        bnbcode: "",
        oldBnbcodes: [],
        usedBnbcodes: [req.body.bnbcode],
        premium: false,
        roles: ["receiver"],
        createdAt: dayjs().toISOString(),
        updatedAt: dayjs().toISOString(),
      });
    } else if (!("receiver" in user.roles)) {
      await docRef.update({
        roles: admin.firestore.FieldValue.arrayUnion("receiver"),
        updatedAt: dayjs().toISOString(),
      });
    }
    await docRef.update({
      usedBnbcodes: admin.firestore.FieldValue.arrayUnion(req.body.bnbcode),
      updatedAt: dayjs().toISOString(),
    });
    if (!contact.premium &&
      (contact.foundOld || dayjs().subtract(10, "minute")
          .isAfter(contact.codeUpdatedAt))) {
      await admin
          .firestore()
          .collection("mail")
          .add({
            to: req.body.email,
            message: {
              subject: "Bnb.contact Too late",
              text: `Hello ${contact.firstname}, \n Your code ${req.body.bnbcode} was used after it's validity period, to receive the contact active premium : https://bnb.contact/keep/${req.body.bnbcode}`,
              html: `Hello ${contact.firstname}, <br/> Your code ${req.body.bnbcode} was used after it's validity period, to receive the contact active premium : <a href="https://bnb.contact/keep/${req.body.bnbcode}"https://bnb.contact/keep/${req.body.bnbcode}</a>`,
            },
          })
          .then(() => console.log("Queued email for delivery!"));
      res.json({status: "ko", error: "too late"});
      return;
    }
    await admin
        .firestore()
        .collection("mail")
        .add({
          to: req.body.email,
          replyTo: contact.email,
          cc: "secure@bnb.contact",
          message: {
            subject: "Your contact Info",
            text: `Hello ${req.body.firstname}, \n Reply to this email to contact ${contact.firstname} at : ${contact.email}, \n You are outside of Airbnb now :)`,
            html: `Hello ${req.body.firstname}, <br/>Reply to this email to contact ${contact.firstname} at : ${contact.email}, \n You are outside of Airbnb now :)`,
          },
        });
    res.json({status: "ok"});
    return;
  } catch (err) {
    console.error("err", err);
    res.json({status: "ko", error: err});
    return;
  }
});


exports.stripe_events = functions.https.onRequest(async (request, response) => {
  const sig = request.headers["stripe-signature"] || "";
  try {
    const event = stripe.webhooks
        .constructEvent(request.rawBody, sig, configSecret.stripe.sign_secret);
    await admin.database()
        .ref("/stripe_events")
        .push(event)
        .then(async (snapshot) => {
          const paymentObject: any = event.data.object;
          // eslint-disable-next-line camelcase
          const userUID = paymentObject?.billing_details?.email;
          if (event.type === "customer.subscription.created" ||
          event.type === "customer.subscription.updated") {
            try {
              await admin.firestore()
                  .collection("users")
                  .doc(userUID)
                  .set({
                    subscriptionId: paymentObject.id,
                    premium: true,
                    updatedAt: dayjs().toISOString(),
                  }, {merge: true});
            } catch (err) {
              console.error(`Error update user for ${event.type}:`, err);
            }
          } else if (event.type === "charge.succeeded") {
            try {
              await admin.firestore()
                  .collection("users")
                  .doc(userUID)
                  .set({
                    customerId: paymentObject.customer,
                    premium: true,
                    updatedAt: dayjs().toISOString(),
                  }, {merge: true});
            } catch (err) {
              console.error(`Error update user for ${event.type}:`, err);
            }
          } else if (event.type === "charge.failed" ||
          event.type === "customer.subscription.deleted") {
            try {
              await admin.firestore()
                  .collection("users")
                  .doc(userUID)
                  .set({
                    subscriptionId: null,
                    premium: false,
                    updatedAt: dayjs().toISOString(),
                  }, {merge: true});
            } catch (err) {
              console.error(`Error update user for ${event.type}:`, err);
            }
          }
          return response.json({received: true, ref: snapshot.ref.toString()});
        })
        .catch((err) => {
          console.error("Event error", err);
          return response.status(500).end();
        });
    return Promise.resolve();
  } catch (err) {
    return response.status(400).end();
  }
});

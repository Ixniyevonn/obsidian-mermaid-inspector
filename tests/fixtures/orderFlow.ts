export const ORDER_FLOW_SOURCE = `flowchart TB
  User["User"]
  Catalog["Catalog"]
  Promo["Promo"]
  subgraph Outer["Order Processing"]
    Validate["Validate Request"]
    Build["Build Order"]
    Review["Review Items"]
    Audit["Audit Log"]
    subgraph Inner["Payment Subsystem"]
      Enter["Enter Payment"]
      ValidateCard["Validate Card"]
      Fraud{"Fraud Check"}
      Auth["Authorize"]
      Capture["Capture Funds"]
      Receipt["Issue Receipt"]
    end
    Discounts["Apply Discounts"]
    Confirm["Confirm Order"]
    ShipPrep["Prepare Shipment"]
  end
  Notify["Notify Customer"]
  Inventory["Reserve Stock"]
  Analytics["Analytics"]
  Done["Done"]
  User --> Catalog
  Promo --> Catalog
  Catalog --> Validate
  User -.->|express| Validate
  Validate --> Build
  Build --> Review
  Review -->|toPayment| Inner
  Inner -->|paid| Discounts
  Discounts --> Confirm
  Confirm --> ShipPrep
  Review --> Audit
  Inner -->|paymentEvent| Audit
  ShipPrep --> Notify
  ShipPrep --> Inventory
  Inventory --> Analytics
  Notify --> Done
  Analytics --> Done
  Enter --> ValidateCard
  ValidateCard --> Fraud
  Fraud -->|ok| Auth
  Fraud -->|fraud| Receipt
  Auth --> Capture
  Capture --> Receipt
  Receipt -->|done| ShipPrep
  Enter -.->|retry| ValidateCard`;

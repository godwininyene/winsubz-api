const catchAsync = require('./../utils/catchAsync');
const AppError = require('../utils/appError');
const providerService = require('../services/providerService');
const smmTransactionService = require('../services/smmTransactionService');
const { SmmTransaction ,User} = require("../models");
const APIFeatures = require("../utils/apiFeatures");
const generatePaginationMeta = require("./../utils/pagination");


/**
 * Enterprise Markup logic for SMM orders.
 * Streamlined to handle clean DECIMAL floating points.
 */
function applySmmMarkup(costPrice) {
  const RATE = 0.20; // 20% system markup margin
  const MIN = 150;   // Higher baseline profit margin (₦150 minimum profit)
  const MAX = 1500;  // Increased profit ceiling for bigger bulk packages

  let profit = costPrice * RATE;
  if (profit < MIN) profit = MIN;
  if (profit > MAX) profit = MAX;

  const sellingPrice = costPrice + profit;

  // Enforce consistent 4-decimal place string conversions for safe MySQL DECIMAL handling
  return {
    sellingPrice: Number(sellingPrice.toFixed(4)),
    profit: Number(profit.toFixed(4))
  };
}

/**
 * Safe Platform extraction helper to prevent writing raw category junk to the DB
 */
function extractCleanPlatform(nameStr, categoryStr) {
  const combined = `${nameStr || ''} ${categoryStr || ''}`.toLowerCase();
  if (combined.includes('instagram')) return 'Instagram';
  if (combined.includes('tiktok')) return 'TikTok';
  if (combined.includes('facebook')) return 'Facebook';
  if (combined.includes('youtube')) return 'YouTube';
  if (combined.includes('twitter') || combined.includes('x ')) return 'Twitter';
  if (combined.includes('telegram')) return 'Telegram';
  return 'SMM'; // Safe operational generic fallback
}

// In-memory cache engine configurations
let servicesCache = { data: null, lastFetchedAt: null };
const SERVICES_CACHE_TTL_MS = 60 * 60 * 1000; // 1-Hour Time To Live (TTL)

/**
 * 1. Fetches and transforms the live service catalog with optimal memory caching layers
 * FIXED: Now calculates and injects marked-up rates so front-end matches transaction bills perfectly.
 */
exports.getSmmServices = catchAsync(async (req, res, next) => {
  const now = Date.now();
  const isStale =
    !servicesCache.data ||
    !servicesCache.lastFetchedAt ||
    (now - servicesCache.lastFetchedAt) > SERVICES_CACHE_TTL_MS;

  let rawServices;
  if (isStale) {
    try {
      rawServices = await providerService.dispatch("owlet", "services", {});
      // Protect memory layer by locking down atomic cache updates cleanly
      servicesCache = { data: rawServices, lastFetchedAt: now };
    } catch (err) {
      // Graceful degradation fallback: serve stale cache if upstream provider api is completely offline
      if (servicesCache.data) {
        console.warn("Upstream service catalog fetch failed. Defaulting safely to stale cache backup.");
        rawServices = servicesCache.data;
      } else {
        return next(new AppError("Unable to fetch categories. Please try again shortly.", "", 503));
      }
    }
  } else {
    rawServices = servicesCache.data;
  }

  // Filter functionality by explicit query target string (?platform=Instagram)
  const { platform } = req.query;
  let filtered = rawServices;
  if (platform) {
    const searchTarget = platform.toLowerCase();
    filtered = rawServices.filter((s) =>
      s.category?.toLowerCase().includes(searchTarget) ||
      s.name?.toLowerCase().includes(searchTarget)
    );
  }

  const formatted = filtered.map((s) => {
    const costPricePer1000 = parseFloat(s.rate);
    
    // Calculate the user's selling rate for exactly 1,000 units using your business markup rules
    const { sellingPrice: userRatePer1000 } = applySmmMarkup(costPricePer1000);

    return {
      serviceId: String(s.service),
      name: s.name,
      category: s.category,
      min: parseInt(s.min, 10) || 1,
      max: parseInt(s.max, 10) || 1000000,
      refill: !!s.refill,
      rateProviderPer1000: userRatePer1000, 
    };
  });

  res.status(200).json({
    status: "success",
    result: formatted.length,
    data: { services: formatted }
  });
});

/**
 * 2. Places an SMM purchase order with strict cost isolation structures
 */
exports.placeSmmOrder = catchAsync(async (req, res, next) => {
  const { serviceId, link, quantity, requestId, platform, serviceName } = req.body;

  // Parameter Integrity Guard Barriers
  if (!requestId) return next(new AppError("Request ID is required", "", 400));
  if (!serviceId || !link || !quantity) {
    return next(new AppError("serviceId, link and quantity are required", "", 400));
  }
  if (!/^https?:\/\//.test(link)) {
    return next(new AppError("Link must be a valid URL", "", 400));
  }

  const qty = parseInt(quantity, 10);
  if (isNaN(qty) || qty <= 0) {
    return next(new AppError("Quantity must be a valid positive number", "", 400));
  }

  // Double-Check Cache State & populate atomically
  let rawServices = servicesCache.data;
  if (!rawServices) {
    rawServices = await providerService.dispatch("owlet", "services", {});
    servicesCache = { data: rawServices, lastFetchedAt: Date.now() };
  }

  const service = rawServices.find((s) => String(s.service) === String(serviceId));
  if (!service) return next(new AppError("The targeted service identifier could not be validated or is currently inactive.", "", 400));

  // Enforce boundary parameters rigorously against upstream catalog constraints
  if (qty < parseInt(service.min) || qty > parseInt(service.max)) {
    return next(new AppError(`Quantity must be between ${service.min} and ${service.max}`, "", 400));
  }

  // Calculated completely as a fluid decimal value
  const costPrice = Number(((parseFloat(service.rate) / 1000) * qty).toFixed(4));
  const { sellingPrice, profit } = applySmmMarkup(costPrice);

  let context;
  try {
    context = await smmTransactionService.initialize({
      userId: req.user.id,
      // platform: platform || extractCleanPlatform(service.name, service.category),
      platform:  extractCleanPlatform(service.name, service.category),
      serviceId: String(serviceId),
      serviceName: serviceName || service.name,
      link: link.trim(),
      quantity: qty,
      costPrice, 
      sellingPrice,   
      profit,              
      requestId,
    });
  } catch (initErr) {
    if (initErr.isOperational) {
      return next(new AppError(initErr.message, "", initErr.statusCode || 400));
    }
    console.error("Critical: SMM transaction failed to initialize:", initErr.message);
    return next(new AppError("System busy. Please try again shortly.", "", 500));
  }

  if (context.isDuplicate) {
    return res.status(200).json({
      status: "success",
      data: { transaction: await smmTransactionService.getResponsePayload(context.tx.id) }
    });
  }

  try {
    // Fire structural request handling pipeline out downstream
    await providerService.processOwletTransaction({
      context,
      serviceId,
      link: link.trim(),
      quantity: qty,
      costPrice,
      sellingPrice,
    });
  } catch (err) {
    console.error("SMM runtime processing failure:", err.message);
    if (context?.tx) {
      try {
        await context.tx.update({
          status: "failed", 
          providerStatus: err.message || "Network connection error",
          deliveryMessage: "Transaction failed during provider allocation sync setup routines."
        });
      } catch (dbErr) {
        console.error("Critical: DB update failed during SMM fallback:", dbErr.message);
      }
    }
  }

  const output = await smmTransactionService.getResponsePayload(context.tx.id);

  if (output && output.providerStatus) {
    const statusString = String(output.providerStatus).toLowerCase();
    if (statusString.includes("funds") || statusString.includes("balance")) {
      output.providerStatus = "Service Maintenance";
    }
  }

  const isFailed = output.status === "failed";

  return res.status(200).json({
    status: isFailed ? "error" : "success",
    message: output.status === "processing"
      ? "Order placed successfully — delivery in progress."
      : isFailed
        ? (output.deliveryMessage || "Service temporarily unavailable due to upstream provider maintenance.")
        : "Order processing initialized.",
    data: { transaction: output }
  });
});

/**
 * 3. Syncs and updates the transactional ledger row state from provider records on demand
 */
exports.checkSmmOrderStatus = catchAsync(async (req, res, next) => {
  const { orderId } = req.params;

  const tx = await SmmTransaction.findByPk(orderId);
  if (!tx) return next(new AppError("Transaction not found", "", 404));

  // Route calculation updates straight into the thread-safe transactional sync framework
  await smmTransactionService.verifyOrderStatus(tx, true);
  const output = await smmTransactionService.getResponsePayload(tx.id);

  res.status(200).json({
    status: "success",
    data: { transaction: output }
  });
});


/**
 * 4. Fetch historical SMM ledger activity records with full multi-role capability
 */
exports.getAllSmmTransactions = catchAsync(async (req, res, next) => {
  const features = new APIFeatures(req.query, "SmmTransaction")
    .filter()
    .sort()
    .limitFields()
    .paginate();

  // Ensure only user's transactions are returned
  if (req.user?.role === "user") {
    features.queryOptions.where = {
      ...features.queryOptions.where,
      userId: req.user.id,
    };
  }

  // If admin, include user details
  if (req.user?.role === "admin") {
    features.queryOptions.include = [
      {
        model: User,
        as: "user",
        attributes: ["firstName", "lastName", "photo", "email"],
      },
    ];
  }

  // Execute query
  const { count, rows: targetOrders } = await SmmTransaction.findAndCountAll(features.getFeaures());
  const { page, limit } = features.getPaginationInfo();
  const pagination = generatePaginationMeta(req, page, limit, count);

  //Send Response
  res.status(200).json({
    status: "success",
    pagination,
    result: targetOrders.length,
    data: {
      transactions: targetOrders,
    },
  });
});
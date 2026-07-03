/**
 * Safely extracts and normalizes a string message from inconsistent provider responses
 * to prevent database validation crashes (Sequelize DataType.STRING violations).
 * 
 * @param {any} apiResponse - The raw api_response field from the provider
 * @param {any} rootMessage - The raw message field from the root of the response
 * @returns {string|null} A clean string capped at 250 characters, or null
 */
module.exports = (apiResponse, rootMessage) => {
  let deliveryMessage = null;

  if (apiResponse) {
    if (typeof apiResponse === 'object' && apiResponse !== null) {
      // Dig out common string keys from nested structures
      deliveryMessage = apiResponse.message || apiResponse.description || JSON.stringify(apiResponse);
    } else {
      deliveryMessage = apiResponse;
    }
  } else if (rootMessage) {
    deliveryMessage = rootMessage;
  }

  // Flatten arrays or rogue objects down to a flat string representation
  if (Array.isArray(deliveryMessage)) {
    deliveryMessage = deliveryMessage.join(' | ');
  } else if (typeof deliveryMessage === 'object' && deliveryMessage !== null) {
    deliveryMessage = JSON.stringify(deliveryMessage);
  } else if (deliveryMessage) {
    deliveryMessage = String(deliveryMessage);
  }

  // Guard against database string length constraint overflows (VARCHAR 255)
  if (deliveryMessage && deliveryMessage.length > 255) {
    return deliveryMessage.substring(0, 250) + '...';
  }

  return deliveryMessage;
};
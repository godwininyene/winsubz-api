'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class Giftcard extends Model {
    static associate(models) {
    }
  }
  Giftcard.init({
    cardName:{
      type:DataTypes.STRING,
      allowNull:false,
      unique:true,
      validate:{
        notNull:{msg:'Please provide card name'},
        notEmpty:{msg:'Card name cannot be empty'}
      }
    },
    cardImage:{
      type:DataTypes.STRING,
      allowNull:false,
      validate:{
        notNull:{msg:'Please provide card image/logo'},
        notEmpty:{msg:'Card image/logo cannot be empty'}
      }
    },
    cardType:{
      type:DataTypes.STRING,
      allowNull:false,
      validate:{
        notNull:{msg:'Please provide card type'},
        notEmpty:{msg: 'Card type cannot be empty'}
      }
    },
    cardRate:{
      type:DataTypes.DOUBLE,
      allowNull:false,
      validate:{
        notNull:{msg: 'Please provide card rate'},
        notEmpty:{msg: 'Card rate cannot be empty'}
      }
    },
    status:{
      type:DataTypes.ENUM('active', 'inactive'),
      defaultValue:'active'
    },
  }, {
    sequelize,
    modelName: 'Giftcard',
    tableName:'giftcards'
  });
  return Giftcard;
};
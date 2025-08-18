'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class Coin extends Model {
    static associate(models) {
    }
  }
  Coin.init({
    coinName:{
      type:DataTypes.STRING,
      allowNull:false,
      unique:true,
      validate:{
        notNull:{msg: 'Please provide coin name'},
        notEmpty:{msg: 'Coin name cannot be empty'}
      }
    },
    coinAddress:{
      type:DataTypes.STRING,
      allowNull:false,
      validate:{
        notNull:{msg: 'Please provide coin wallet address'},
        notEmpty:{msg: 'Coin wallet address cannot be empty'}
      }
    },
    coinRate:{
      type:DataTypes.DOUBLE,
      allowNull:false,
      validate:{
        notNull:{msg: 'Please provide coin rate'},
        notEmpty:{msg: 'Coin rate cannot be empty'}
      }
    },
    coinImage:{
      type:DataTypes.STRING,
      allowNull:false,
      validate:{
        notNull:{msg: 'Please provide coin image/logo'},
        notEmpty:{msg: 'Coin image cannot be empty'}
      }
    },
    status:{
      type:DataTypes.ENUM('active', 'inactive'),
      defaultValue:'active',
      validate:{
        isIn:{
          args:[['active', 'inactive']],
          msg: 'Coin status is either active or inactive'
        }
      }
    }
  }, {
    sequelize,
    modelName: 'Coin',
    tableName:'coins'
  });
  return Coin;
};
'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class Funding extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // define association here
    }
  }
  Funding.init({
    reference: DataTypes.STRING,
    amount: DataTypes.INTEGER,
    status: DataTypes.STRING,
    type: DataTypes.STRING,
    userId: DataTypes.INTEGER,
    charge:DataTypes.INTEGER,
    creditedAmount:DataTypes.INTEGER
    
  }, {
    sequelize,
    modelName: 'Funding',
    tableName:'fundings'
  });
  return Funding;
};


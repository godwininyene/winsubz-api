'use strict';
const {
  Model
} = require('sequelize');
const bcrypt = require('bcryptjs')
module.exports = (sequelize, DataTypes) => {
  class User extends Model {
    async correctPassword(candidatePassword, userPassword) {
      return await bcrypt.compare(candidatePassword, userPassword)
    }
    changedPasswordAfter(jwtTimeStamp) {
      //User has changed password
      if (this.passwordChangedAt) {
        const changeTime = this.passwordChangedAt.getTime() / 1000;
        return changeTime > jwtTimeStamp;
      }
    }
    static associate(models) {
      User.hasOne(models.Wallet, { foreignKey: 'userId', as: 'wallet' })
      User.hasMany(models.Transaction, { foreignKey: 'userId', as: 'transactions' })
      User.hasOne(models.VirtualAccount, {
        foreignKey: "userId",
        as: "virtualAccount"
      });
    }
  }
  User.init({
    firstName: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        notNull: { msg: 'Please provide your firstname' },
        notEmpty: { msg: 'Firstname cannot be empty' }
      }
    },
    lastName: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        notNull: { msg: 'Please provide your lastname' },
        notEmpty: { msg: 'Lastname cannot be empty' }
      }
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        notNull: { msg: 'Please your email address' },
        notEmpty: { msg: 'Email address cannot be empty' },
        isEmail: { msg: 'Please provide a valid email address' }
      }
    },

    phone: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: {
        notNull: { msg: 'Please provide your phone number' },
        notEmpty: { msg: 'Phone number cannot be empty' }
      }
    },
    password: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        notNull: { msg: 'Please provide your password' },
        notEmpty: { msg: 'Password cannot be empty' },
        len: {
          args: [8, 100],
          msg: 'Password must be between 8 and 100 characters long'
        }
      }
    },
    passwordConfirm: {
      type: DataTypes.VIRTUAL,
      allowNull: false,
      validate: {
        notNull: { msg: 'Please confirm your password' },
        notEmpty: { msg: 'PasswordConfirm cannot be empty' },
        isMatch(value) {
          if (value !== this.password) {
            throw new Error('The password confirmation does not match')
          }
        }
      }
    },
    passwordResetToken: DataTypes.STRING,
    passwordChangedAt: DataTypes.DATE,
    accountId: {
      type: DataTypes.STRING,
      unique: true
    },
    referralId: DataTypes.STRING,
    role: {
      type: DataTypes.ENUM('user', 'admin'),
      defaultValue: 'user'
    },
    status: {
      type: DataTypes.ENUM('active', 'pending', 'deactivated'),
      allowNull: false,
      defaultValue: 'active',
      validate: {
        isIn: {
          args: [['active', 'pending', 'deactivated']],
          msg: 'Invalid user status'
        }
      }
    },
    active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    photo: {
      type: DataTypes.STRING,
      defaultValue: `${process.env.APP_URL}/img/users/default.jpg`
    },
    passwordResetExpires: DataTypes.DATE
  }, {
    sequelize,
    modelName: 'User',
    tableName: 'users',
    hooks: {
      beforeSave: async (user) => {
        // 1. Hash password if it's new or changed
        if (user.changed('password')) {
          user.password = await bcrypt.hash(user.password, 12)
          //2. Set passwordChangedAt only when updating existing user
          if (!user.isNewRecord) {
            user.passwordChangedAt = Date.now() - 1000;
          }
        }
      }
    },
    defaultScope: {
      where: { active: true },
      attributes: {
        exclude: ['password', 'active']
      }
    },
    scopes: {
      withPassword: {
        attributes: {
          include: ['password']
        }
      }
    }
  });
  return User;
};



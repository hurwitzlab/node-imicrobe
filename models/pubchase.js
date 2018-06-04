/* jshint indent: 2 */

module.exports = function(sequelize, DataTypes) {
  return sequelize.define('pubchase', {
    pubchase_id: {
      type: DataTypes.INTEGER(10).UNSIGNED,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true
    },
    article_id: {
      type: DataTypes.INTEGER(11),
      allowNull: true,
      unique: true
    },
    title: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    journal_title: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    doi: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    authors: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    article_date: {
      type: DataTypes.DATE,
      allowNull: true
    },
    created_on: {
      type: DataTypes.DATE,
      allowNull: true
    },
    url: {
      type: DataTypes.TEXT,
      allowNull: true
    }
  }, {
    tableName: 'pubchase'
  });
};

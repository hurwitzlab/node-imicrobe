/* jshint indent: 2 */

module.exports = function(sequelize, DataTypes) {
  return sequelize.define('pfam_annotation', {
    uproc_id: {
      type: DataTypes.INTEGER(10).UNSIGNED,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true
    },
    accession: {
      type: DataTypes.STRING(16),
      allowNull: true,
      unique: true
    },
    identifier: {
      type: DataTypes.STRING(16),
      allowNull: true
    },
    name: {
      type: DataTypes.STRING(80),
      allowNull: true
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    }
  }, {
    tableName: 'pfam_annotation'
  });
};

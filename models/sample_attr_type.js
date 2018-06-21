/* jshint indent: 2 */

module.exports = function(sequelize, DataTypes) {
  return sequelize.define('sample_attr_type', {
    sample_attr_type_id: {
      type: DataTypes.INTEGER(10).UNSIGNED,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true
    },
    sample_attr_type_category_id: {
      type: DataTypes.INTEGER(10).UNSIGNED,
      allowNull: true,
      references: {
        model: 'sample_attr_type_category',
        key: 'sample_attr_type_category_id'
      }
    },
    type: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true
    },
    url_template: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    units: {
      type: DataTypes.STRING(50),
      allowNull: true
    }
  }, {
    tableName: 'sample_attr_type'
  });
};

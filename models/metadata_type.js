/* jshint indent: 2 */

module.exports = function(sequelize, DataTypes) {
  return sequelize.define('metadata_type', {
    metadata_type_id: {
      type: DataTypes.INTEGER(10).UNSIGNED,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true
    },
    category: {
      type: DataTypes.STRING(64),
      allowNull: false,
      defaultValue: ''
    },
    category_type: {
      type: DataTypes.STRING(32),
      allowNull: true
    },
    qiime_tag: {
      type: DataTypes.STRING(128),
      allowNull: true
    },
    mgrast_tag: {
      type: DataTypes.STRING(128),
      allowNull: true
    },
    tag: {
      type: DataTypes.STRING(128),
      allowNull: false,
      defaultValue: ''
    },
    definition: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    required: {
      type: DataTypes.INTEGER(4),
      allowNull: false,
      defaultValue: '0'
    },
    mixs: {
      type: DataTypes.INTEGER(4),
      allowNull: false,
      defaultValue: '0'
    },
    type: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    fw_type: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    unit: {
      type: DataTypes.TEXT,
      allowNull: true
    }
  }, {
    tableName: 'metadata_type'
  });
};

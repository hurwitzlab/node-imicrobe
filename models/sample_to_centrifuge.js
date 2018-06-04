/* jshint indent: 2 */

module.exports = function(sequelize, DataTypes) {
  return sequelize.define('sample_to_centrifuge', {
    sample_to_centrifuge_id: {
      type: DataTypes.INTEGER(10).UNSIGNED,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true
    },
    sample_id: {
      type: DataTypes.INTEGER(10).UNSIGNED,
      allowNull: false,
      defaultValue: '0',
      references: {
        model: 'sample',
        key: 'sample_id'
      }
    },
    centrifuge_id: {
      type: DataTypes.INTEGER(10).UNSIGNED,
      allowNull: false,
      defaultValue: '0',
      references: {
        model: 'centrifuge',
        key: 'centrifuge_id'
      }
    },
    num_reads: {
      type: DataTypes.INTEGER(10).UNSIGNED,
      allowNull: false,
      defaultValue: '0'
    },
    num_unique_reads: {
      type: DataTypes.INTEGER(10).UNSIGNED,
      allowNull: false,
      defaultValue: '0'
    },
    abundance: {
      type: "DOUBLE UNSIGNED",
      allowNull: false,
      defaultValue: '0'
    }
  }, {
    tableName: 'sample_to_centrifuge'
  });
};

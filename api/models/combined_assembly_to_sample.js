/* jshint indent: 2 */

module.exports = function(sequelize, DataTypes) {
  return sequelize.define('combined_assembly_to_sample', {
    combined_assembly_to_sample_id: {
      type: DataTypes.INTEGER(10).UNSIGNED,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true
    },
    combined_assembly_id: {
      type: DataTypes.INTEGER(10).UNSIGNED,
      allowNull: false,
      references: {
        model: 'combined_assembly',
        key: 'combined_assembly_id'
      }
    },
    sample_id: {
      type: DataTypes.INTEGER(10).UNSIGNED,
      allowNull: false,
      references: {
        model: 'sample',
        key: 'sample_id'
      }
    }
  }, {
    tableName: 'combined_assembly_to_sample'
  });
};

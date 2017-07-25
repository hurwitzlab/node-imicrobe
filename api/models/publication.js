/* jshint indent: 2 */

module.exports = function(sequelize, DataTypes) {
  return sequelize.define('publication', {
    publication_id: {
      type: DataTypes.INTEGER(10).UNSIGNED,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true
    },
    project_id: {
      type: DataTypes.INTEGER(10).UNSIGNED,
      allowNull: true,
      references: {
        model: 'project',
        key: 'project_id'
      }
    },
    pub_code: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    doi: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    author: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    title: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    pubmed_id: {
      type: DataTypes.INTEGER(11),
      allowNull: true
    },
    journal: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    pub_date: {
      type: DataTypes.TEXT,
      allowNull: true
    }
  }, {
    tableName: 'publication'
  });
};

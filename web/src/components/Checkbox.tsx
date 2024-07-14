import React from 'react';

interface CheckboxProps {
  value: boolean;
  onChange: () => void;
  title: string;
  description: string;
}

const Checkbox: React.FC<CheckboxProps> = ({ value, onChange, title, description }) => {
  return (
    <div style={{ maxWidth: '400px' }}>
      <input
        type="checkbox"
        checked={value}
        onChange={onChange}
      />
      <label title={title}>
        {title}
        <br />
        <span style={{ fontSize: 'smaller' }}>
          {description}
        </span>
      </label>
    </div>
  );
};

export default Checkbox;
